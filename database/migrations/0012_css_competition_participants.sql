-- =============================================================================
-- 0012 — Participación explícita en cada competición.
--
-- La relación grupo ↔ competición ya existe mediante la clave foránea
-- `round_id` de los registros de puntuación. Esta migración añade además una
-- tabla explícita de PARTICIPANTES por ejecución de competición, que:
--   * se rellena automáticamente al iniciar una competición con los grupos
--     activos en ese momento (roster fijo de la competición);
--   * permite verificar en el servidor que un grupo participa en la ejecución
--     concreta antes de puntuar (`submit_css_selector`);
--   * conserva la integridad referencial (se borra en cascada con la ronda o
--     con el grupo).
--
-- Regla reforzada: un grupo que no participa en una competición no puede
-- obtener puntos en ella, aunque esté activo. No se borra ningún grupo, código
-- de acceso, historial ni puntuación anterior.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabla de participantes por competición (ejecución = `competition_rounds`).
-- -----------------------------------------------------------------------------
create table public.competition_participants (
	round_id uuid not null references public.competition_rounds (id) on delete cascade,
	group_id uuid not null references public.groups (id) on delete cascade,
	joined_at timestamptz not null default now(),
	primary key (round_id, group_id)
);

create index competition_participants_group_idx
	on public.competition_participants (group_id);

-- -----------------------------------------------------------------------------
-- 2. Asociación del historial (determinista).
--
--    Para las competiciones ya existentes no se conoce el roster original; se
--    registran como participantes los grupos que dejaron actividad en esa
--    ronda (eventos, propiedades o intentos). No se inventan participantes.
--    Para la competición que esté abierta, se añaden todos los grupos activos
--    para no bloquear la ejecución en curso.
-- -----------------------------------------------------------------------------
insert into public.competition_participants (round_id, group_id)
select distinct x.round_id, x.group_id
from (
	select round_id, group_id from public.scoring_events where round_id is not null
	union
	select round_id, group_id from public.group_property_scores where round_id is not null
	union
	select round_id, group_id from public.group_attempts where round_id is not null
) x
on conflict (round_id, group_id) do nothing;

insert into public.competition_participants (round_id, group_id)
select r.id, g.id
from public.competition_rounds r
cross join public.groups g
where r.ended_at is null and g.active
on conflict (round_id, group_id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. Alta automática de participantes al iniciar una competición.
--    Se hace con un disparador para cubrir cualquier vía de inserción de una
--    ronda (la función `start_competition_round` o inserciones directas).
-- -----------------------------------------------------------------------------
create or replace function public.on_competition_round_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
	insert into public.competition_participants (round_id, group_id)
	select new.id, g.id
	from public.groups g
	where g.active
	on conflict (round_id, group_id) do nothing;
	return new;
end;
$$;

drop trigger if exists competition_rounds_participants on public.competition_rounds;
create trigger competition_rounds_participants
	after insert on public.competition_rounds
	for each row execute function public.on_competition_round_created();

-- -----------------------------------------------------------------------------
-- 4. Exigir participación en la entrega.
--
--    Se redefine `submit_css_selector` (misma lógica que 0011) añadiendo la
--    comprobación de pertenencia a la competición activa: si el grupo no es
--    participante de esa ejecución, no puntúa ni penaliza. Todo lo demás
--    (aislamiento por ronda, penalización limitada al saldo de la competición,
--    bonificación por competición, idempotencia y concurrencia) se conserva.
-- -----------------------------------------------------------------------------
create or replace function public.submit_css_selector(
	p_group_id uuid,
	p_selector_id uuid,
	p_declarations jsonb,
	p_request_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
	v_group public.groups%rowtype;
	v_round record;
	v_selector public.exercise_selectors%rowtype;
	v_decl jsonb;
	v_rule public.selector_rules%rowtype;
	v_points integer;
	v_total_rules integer;
	v_scored integer;
	v_awarded integer := 0;
	v_new_properties integer := 0;
	v_incorrect integer := 0;
	v_fully boolean := false;
	v_speed_bonus boolean := false;
	v_bonus_cur integer;
	v_first_attempt timestamptz;
	v_elapsed numeric;
	v_settings public.competition_settings%rowtype;
	v_balance integer := 0;
	v_round_balance integer := 0;
	v_intended_penalty integer := 0;
	v_applied_penalty integer := 0;
	v_request public.css_submission_requests%rowtype;
	v_response jsonb;
begin
	-- Estado del grupo.
	select * into v_group from public.groups where id = p_group_id;
	if not found or not v_group.active then
		return jsonb_build_object(
			'status', 'inactive_group',
			'message', 'El grupo no puede participar por ahora.'
		);
	end if;

	-- Ronda abierta → competición activa (su ejercicio define el ámbito).
	select r.id, e.id as exercise_id, e.active as exercise_active, e.archived as exercise_archived
	into v_round
	from public.competition_rounds r
	join public.exercises e on e.id = r.exercise_id
	where r.ended_at is null
	order by r.started_at desc
	limit 1;
	if not found then
		return jsonb_build_object('status', 'no_round', 'message', 'No hay competición activa.');
	end if;
	if not v_round.exercise_active or v_round.exercise_archived then
		return jsonb_build_object(
			'status', 'inactive_exercise',
			'message', 'El ejercicio no está activo.'
		);
	end if;

	-- Participación: el grupo debe formar parte de ESTA ejecución. El
	-- `competition_id` nunca se acepta del cliente; se resuelve en el servidor.
	if not exists (
		select 1 from public.competition_participants
		where round_id = v_round.id and group_id = p_group_id
	) then
		return jsonb_build_object(
			'status', 'not_participating',
			'message', 'Tu grupo no participa en esta competición.'
		);
	end if;

	-- Selector autorizado (debe pertenecer al ejercicio de la competición activa).
	select * into v_selector
	from public.exercise_selectors
	where id = p_selector_id and exercise_id = v_round.exercise_id and active = true;
	if not found then
		return jsonb_build_object('status', 'invalid_selector', 'message', 'La entrega no es válida.');
	end if;

	-- Estructura mínima del cuerpo de la entrega (defensa en profundidad).
	if p_declarations is null
		or jsonb_typeof(p_declarations) <> 'array'
		or jsonb_array_length(p_declarations) = 0 then
		insert into public.group_attempts (group_id, selector_id, round_id, success, awarded_points, reason)
		values (p_group_id, p_selector_id, v_round.id, false, 0, 'empty');
		return jsonb_build_object('status', 'invalid_submission', 'message', 'La entrega no es válida.');
	end if;

	for v_decl in select value from jsonb_array_elements(p_declarations) loop
		if jsonb_typeof(v_decl -> 'property') <> 'string'
			or jsonb_typeof(v_decl -> 'value') <> 'string' then
			insert into public.group_attempts (group_id, selector_id, round_id, success, awarded_points, reason)
			values (p_group_id, p_selector_id, v_round.id, false, 0, 'malformed');
			return jsonb_build_object('status', 'invalid_submission', 'message', 'La entrega no es válida.');
		end if;
	end loop;

	-- Idempotencia: reserva la petición y devuelve la respuesta previa si ya
	-- se había procesado. El `select ... for update` serializa reintentos
	-- simultáneos del mismo request_id.
	if p_request_id is not null then
		insert into public.css_submission_requests (request_id, group_id, selector_id, round_id)
		values (p_request_id, p_group_id, p_selector_id, v_round.id)
		on conflict (request_id) do nothing;

		select * into v_request
		from public.css_submission_requests
		where request_id = p_request_id
		for update;

		if v_request.group_id <> p_group_id then
			-- Un request_id ajeno no se revela: respuesta genérica.
			return jsonb_build_object('status', 'invalid_submission', 'message', 'La entrega no es válida.');
		end if;

		if v_request.response <> '{}'::jsonb then
			return v_request.response;
		end if;
	end if;

	select * into v_settings from public.competition_settings where id = true;

	-- Bloquea el marcador del grupo (creando la fila si no existe). Este lock
	-- serializa las entregas simultáneas del mismo grupo; el saldo de la
	-- COMPETICIÓN se calcula a continuación sobre los eventos de esta ronda.
	insert into public.group_scores (group_id, total_points)
	values (p_group_id, 0)
	on conflict (group_id) do nothing;

	select total_points into v_balance
	from public.group_scores
	where group_id = p_group_id
	for update;

	-- Saldo aislado de la competición activa (antes de esta entrega).
	select coalesce(sum(points), 0) into v_round_balance
	from public.scoring_events
	where group_id = p_group_id and round_id = v_round.id;

	-- Evaluación contra las reglas privadas del selector.
	for v_decl in select value from jsonb_array_elements(p_declarations) loop
		select * into v_rule
		from public.selector_rules
		where selector_id = p_selector_id
			and property_name = lower(v_decl ->> 'property');
		if not found then
			continue;
		end if;

		if exists (
			select 1 from public.group_property_scores
			where group_id = p_group_id
				and round_id = v_round.id
				and exercise_id = v_round.exercise_id
				and selector_id = p_selector_id
				and property_name = v_rule.property_name
		) then
			continue;
		end if;

		if (v_decl ->> 'value') = v_rule.expected_canonical then
			v_points := null;
			insert into public.group_property_scores
				(round_id, group_id, exercise_id, selector_id, property_name, points)
			values (
				v_round.id,
				p_group_id,
				v_round.exercise_id,
				p_selector_id,
				v_rule.property_name,
				v_rule.points
			)
			on conflict (round_id, group_id, exercise_id, selector_id, property_name)
				where round_id is not null
				do nothing
			returning points into v_points;

			if v_points is not null then
				v_new_properties := v_new_properties + 1;
				v_awarded := v_awarded + v_points;
				insert into public.scoring_events
					(group_id, exercise_id, selector_id, property_name, kind, points, round_id)
				values (
					p_group_id,
					v_round.exercise_id,
					p_selector_id,
					v_rule.property_name,
					'property',
					v_points,
					v_round.id
				);
			end if;
		else
			v_incorrect := v_incorrect + 1;
		end if;
	end loop;

	-- ¿El selector quedó completamente puntuado en esta competición?
	select count(*) into v_total_rules
	from public.selector_rules
	where selector_id = p_selector_id;

	if v_total_rules > 0 then
		select count(*) into v_scored
		from public.group_property_scores
		where group_id = p_group_id
			and round_id = v_round.id
			and exercise_id = v_round.exercise_id
			and selector_id = p_selector_id;
		if v_scored >= v_total_rules then
			v_fully := true;
		end if;
	end if;

	-- Bonificación por velocidad (una única vez por selector y competición).
	if v_fully then
		if v_settings.css_speed_bonus_points > 0
			and v_settings.css_speed_bonus_seconds > 0 then
			v_bonus_cur := null;
			insert into public.group_selector_bonuses
				(round_id, group_id, selector_id, points)
			values (v_round.id, p_group_id, p_selector_id, v_settings.css_speed_bonus_points)
			on conflict (round_id, group_id, selector_id) where round_id is not null
				do nothing
			returning points into v_bonus_cur;

			if v_bonus_cur is not null then
				select min(created_at) into v_first_attempt
				from public.group_attempts
				where group_id = p_group_id
					and selector_id = p_selector_id
					and round_id = v_round.id;

				if v_first_attempt is not null then
					v_elapsed := extract(epoch from (now() - v_first_attempt));
					if v_elapsed <= v_settings.css_speed_bonus_seconds then
						insert into public.scoring_events
							(group_id, exercise_id, selector_id, property_name, kind, points, round_id)
						values (
							p_group_id,
							v_round.exercise_id,
							p_selector_id,
							null,
							'speed',
							v_settings.css_speed_bonus_points,
							v_round.id
						);
						v_awarded := v_awarded + v_settings.css_speed_bonus_points;
						v_speed_bonus := true;
					else
						delete from public.group_selector_bonuses
						where group_id = p_group_id
							and selector_id = p_selector_id
							and round_id = v_round.id;
					end if;
				end if;
			end if;
		end if;
	end if;

	-- Penalización según el modo configurado.
	if v_settings.penalty_enabled
		and v_settings.penalty_points > 0
		and v_incorrect > 0 then
		if v_settings.penalty_mode = 'per_property' then
			v_intended_penalty := v_incorrect * v_settings.penalty_points;
		else
			v_intended_penalty := v_settings.penalty_points;
		end if;
	end if;

	if v_intended_penalty > 0 then
		if v_settings.allow_negative_score then
			v_applied_penalty := v_intended_penalty;
		else
			v_applied_penalty := least(v_intended_penalty, greatest(0, v_round_balance + v_awarded));
		end if;
	end if;

	if v_applied_penalty > 0 then
		insert into public.scoring_events
			(group_id, exercise_id, selector_id, property_name, kind, points, round_id)
		values (
			p_group_id,
			v_round.exercise_id,
			p_selector_id,
			null,
			'penalty',
			-v_applied_penalty,
			v_round.id
		);
	end if;

	-- El intento evaluable queda registrado (auditoría).
	insert into public.group_attempts
		(group_id, selector_id, round_id, success, awarded_points, penalty_points, net_points, new_properties, request_id, reason)
	values (
		p_group_id,
		p_selector_id,
		v_round.id,
		v_awarded > 0,
		v_awarded,
		v_applied_penalty,
		v_awarded - v_applied_penalty,
		v_new_properties,
		p_request_id,
		'evaluated'
	);

	v_response := jsonb_build_object(
		'status', 'ok',
		'awarded', v_awarded,
		'penalty', v_applied_penalty,
		'net', v_awarded - v_applied_penalty,
		'new_properties', v_new_properties,
		'fully_correct', v_fully,
		'speed_bonus', v_speed_bonus,
		'message', case
			when v_applied_penalty > 0 and (v_awarded - v_applied_penalty) > 0 then
				'Has obtenido puntos, con penalización por errores.'
			when v_applied_penalty > 0 then
				'La entrega no ha sumado puntos (penalización aplicada).'
			when v_speed_bonus then '¡Selector completado con bonificación!'
			when v_fully then '¡Selector completado!'
			when v_awarded > 0 then 'Has obtenido puntos.'
			else 'No has obtenido puntos.'
		end
	);

	if p_request_id is not null then
		update public.css_submission_requests
		set response = v_response
		where request_id = p_request_id;
	end if;

	return v_response;
end;
$$;
