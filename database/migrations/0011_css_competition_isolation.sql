-- =============================================================================
-- 0011 — Aislamiento de la puntuación por competición (ronda).
--
-- Regla de negocio: cada competición empieza a 0 para todos los grupos. Un grupo
-- puede participar en varias competiciones, pero los aciertos, penalizaciones y
-- bonificaciones de una competición anterior no deben afectar a la siguiente.
--
-- Entidad de ejecución reutilizada:
--   `competition_rounds` ya representa cada ejecución de una competición
--   (tiene started_at/ended_at y solo admite una abierta a la vez). Se usa como
--   ámbito de puntuación: al iniciar una ronda nueva se abre un ámbito nuevo.
--
-- Clave de una puntuación por regla (unidad de corrección) a partir de ahora:
--   group_id + round_id (competición) + exercise_id + selector_id + property_name
--
-- Historial: las puntuaciones antiguas se asocian a la ronda correcta por
-- ventana temporal (started_at/ended_at) y ejercicio. Si no se puede determinar
-- con fiabilidad, se dejan sin ronda (ámbito histórico) en lugar de inventar
-- una asociación. En ningún caso se borran puntuaciones ni eventos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Ámbito de competición en los registros que alimentan el marcador.
-- -----------------------------------------------------------------------------
alter table public.scoring_events
	add column round_id uuid references public.competition_rounds (id) on delete cascade;

alter table public.group_property_scores
	add column round_id uuid references public.competition_rounds (id) on delete cascade;

alter table public.group_attempts
	add column round_id uuid references public.competition_rounds (id) on delete cascade;

alter table public.group_selector_bonuses
	add column round_id uuid references public.competition_rounds (id) on delete cascade;

alter table public.css_submission_requests
	add column round_id uuid references public.competition_rounds (id) on delete set null;

-- -----------------------------------------------------------------------------
-- 2. Asociación determinista del historial a su competición.
--
--    Una ronda solo cubre su ejercicio y el intervalo [started_at, ended_at).
--    Como solo puede haber una ronda abierta a la vez, cada instante pertenece
--    como mucho a una ronda. Si no hay coincidencia fiable, la fila queda con
--    round_id nulo (ámbito histórico) sin inventar una competición.
-- -----------------------------------------------------------------------------
update public.scoring_events e
set round_id = (
	select r.id
	from public.competition_rounds r
	where r.exercise_id = e.exercise_id
		and e.created_at >= r.started_at
		and (r.ended_at is null or e.created_at < r.ended_at)
	order by r.started_at desc
	limit 1
);

update public.group_property_scores g
set round_id = (
	select r.id
	from public.competition_rounds r
	where r.exercise_id = g.exercise_id
		and g.scored_at >= r.started_at
		and (r.ended_at is null or g.scored_at < r.ended_at)
	order by r.started_at desc
	limit 1
);

update public.group_attempts a
set round_id = (
	select r.id
	from public.competition_rounds r
	join public.exercise_selectors s on s.exercise_id = r.exercise_id
	where s.id = a.selector_id
		and a.created_at >= r.started_at
		and (r.ended_at is null or a.created_at < r.ended_at)
	order by r.started_at desc
	limit 1
)
where a.selector_id is not null;

update public.group_selector_bonuses b
set round_id = (
	select r.id
	from public.competition_rounds r
	join public.exercise_selectors s on s.exercise_id = r.exercise_id
	where s.id = b.selector_id
		and b.awarded_at >= r.started_at
		and (r.ended_at is null or b.awarded_at < r.ended_at)
	order by r.started_at desc
	limit 1
);

-- -----------------------------------------------------------------------------
-- 3. Unicidad por competición.
--
--    La clave nueva incluye `round_id`, de modo que la MISMA regla puede volver
--    a puntuar en otra competición, pero no dos veces dentro de la misma. Se
--    mantiene además la unicidad histórica para las filas sin ronda (ámbito
--    heredado), preservando la integridad de los datos antiguos.
-- -----------------------------------------------------------------------------
alter table public.group_property_scores
	drop constraint if exists group_property_scores_unique;

create unique index group_property_scores_round_unique
	on public.group_property_scores (round_id, group_id, exercise_id, selector_id, property_name)
	where round_id is not null;

create unique index group_property_scores_legacy_unique
	on public.group_property_scores (group_id, exercise_id, selector_id, property_name)
	where round_id is null;

-- La bonificación por velocidad pasa de "una por grupo y selector" a
-- "una por grupo, selector y competición".
alter table public.group_selector_bonuses
	drop constraint if exists group_selector_bonuses_pkey;

create unique index group_selector_bonuses_round_unique
	on public.group_selector_bonuses (round_id, group_id, selector_id)
	where round_id is not null;

create unique index group_selector_bonuses_legacy_unique
	on public.group_selector_bonuses (group_id, selector_id)
	where round_id is null;

-- -----------------------------------------------------------------------------
-- 4. Índices de apoyo para el marcador por competición.
-- -----------------------------------------------------------------------------
create index if not exists scoring_events_round_group_idx
	on public.scoring_events (round_id, group_id);
create index if not exists group_property_scores_round_group_idx
	on public.group_property_scores (round_id, group_id);
create index if not exists group_attempts_round_idx
	on public.group_attempts (round_id);

-- -----------------------------------------------------------------------------
-- 5. Clasificación de una competición concreta.
--
--    Suma exclusivamente los eventos de la ronda indicada (aislamiento total):
--    nunca agrega puntuaciones de competiciones distintas.
-- -----------------------------------------------------------------------------
create or replace function public.round_ranking(p_round_id uuid)
returns table (
	group_id uuid,
	name text,
	color text,
	active boolean,
	total_points integer,
	solved_count integer,
	last_scored_at timestamptz,
	updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
	select
		g.id as group_id,
		g.name,
		g.color,
		g.active,
		coalesce((
			select sum(se.points)
			from public.scoring_events se
			where se.round_id = p_round_id and se.group_id = g.id
		), 0)::int as total_points,
		coalesce((
			select count(*)
			from public.group_property_scores gps
			where gps.round_id = p_round_id and gps.group_id = g.id
		), 0)::int as solved_count,
		(
			select max(se.created_at)
			from public.scoring_events se
			where se.round_id = p_round_id and se.group_id = g.id
		) as last_scored_at,
		coalesce(g.updated_at, g.created_at) as updated_at
	from public.groups g;
$$;

-- -----------------------------------------------------------------------------
-- 6. Redefinir la entrega aislando la competición.
--
--    Cambios respecto a 0010:
--      * todos los registros se asocian a la ronda activa (`round_id`);
--      * la comprobación de "propiedad ya resuelta" y el recuento de selector
--        completado incluyen `round_id` (misma regla puede repuntuar en otra
--        competición, nunca dos veces en la misma);
--      * el `ON CONFLICT` usa las claves nuevas por competición;
--      * el límite de cero de la penalización usa el saldo DENTRO de la
--        competición (no el acumulado histórico), de modo que las
--        penalizaciones de una competición no consumen puntos de otra;
--      * la bonificación por velocidad se concede una vez por competición.
--    El resto (idempotencia, modos de penalización, ejercicio/selector
--    autorizado) se conserva exactamente igual.
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
	-- Estado del grupo (participación: grupo activo, verificado en el servidor).
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
			-- Propiedad no contemplada por la solución: no puntúa ni penaliza.
			continue;
		end if;

		-- Una propiedad ya resuelta EN ESTA COMPETICIÓN no vuelve a puntuar ni
		-- se penaliza; la misma regla sí puede puntuar en otra competición.
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
			-- Propiedad reconocida, evaluada y todavía no resuelta, con un valor
			-- distinto del esperado: cuenta para la penalización.
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
			-- Nunca por debajo de cero DENTRO de esta competición: la
			-- penalización no puede consumir más que el saldo de la
			-- competición más lo concedido en esta entrega.
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
