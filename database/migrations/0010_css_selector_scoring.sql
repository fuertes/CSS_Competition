-- =============================================================================
-- 0010 — Puntuación independiente por selector.
--
-- Causa raíz corregida:
--   * La restricción de unicidad de `group_property_scores` era
--     UNIQUE (group_id, exercise_id, property_name), lo que impedía puntuar la
--     MISMA propiedad en selectores distintos del mismo ejercicio (por ejemplo
--     `color: red` en `body`, `h1` y `.boton`).
--   * La función `submit_css_selector` usaba esa misma clave tanto en la
--     comprobación de "propiedad ya resuelta" como en el `ON CONFLICT`,
--     mezclando reglas de selectores distintos dentro del ejercicio.
--
-- Nueva unidad de corrección y puntuación (regla CSS):
--     exercise_id + selector_id + property_name   (+ valor esperado).
--
-- La clave nueva (group_id, exercise_id, selector_id, property_name) es un
-- refinamiento estricto de la anterior, así que no puede haber duplicados bajo
-- ella y las puntuaciones históricas ya registradas se conservan sin cambios.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Salvaguarda determinista antes de cambiar la restricción.
--
--    Mientras siga vigente la unicidad anterior es imposible que existan
--    duplicados bajo la nueva clave (es una proyección más fina). Si por algún
--    motivo los hubiera, se conserva la fila más antigua (menor `scored_at`,
--    desempate por `id`) y se eliminan las redundantes, SIN volver a sumar
--    puntos ni tocar `scoring_events` (histórico de auditoría intacto).
-- -----------------------------------------------------------------------------
delete from public.group_property_scores a
using public.group_property_scores b
where a.group_id = b.group_id
	and a.exercise_id = b.exercise_id
	and a.selector_id = b.selector_id
	and a.property_name = b.property_name
	and (a.scored_at, a.id) > (b.scored_at, b.id);

-- -----------------------------------------------------------------------------
-- 2. Sustituir la restricción de unicidad incompatible por la clave por
--    grupo + ejercicio + selector + propiedad.
-- -----------------------------------------------------------------------------
alter table public.group_property_scores
	drop constraint if exists group_property_scores_unique;

alter table public.group_property_scores
	add constraint group_property_scores_unique
		unique (group_id, exercise_id, selector_id, property_name);

-- -----------------------------------------------------------------------------
-- 3. Garantizar a nivel de base de datos que el `selector_id` pertenece al
--    `exercise_id` indicado (clave foránea compuesta). Requiere una clave
--    candidata (id, exercise_id) en exercise_selectors.
-- -----------------------------------------------------------------------------
alter table public.exercise_selectors
	add constraint exercise_selectors_id_exercise_unique unique (id, exercise_id);

alter table public.group_property_scores
	add constraint group_property_scores_selector_exercise_fk
		foreign key (selector_id, exercise_id)
		references public.exercise_selectors (id, exercise_id)
		on delete restrict;

-- -----------------------------------------------------------------------------
-- 4. Redefinir la evaluación aislando cada selector.
--
--    Único cambio respecto a la versión de 0008:
--      * la comprobación de "propiedad ya resuelta" incluye `selector_id`, de
--        modo que acertar una regla en un selector no marca la misma propiedad
--        como resuelta en otro;
--      * el `ON CONFLICT` usa la nueva clave por selector.
--    La penalización, el límite de saldo, la bonificación por velocidad y la
--    idempotencia se conservan exactamente igual.
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

	-- Ronda abierta → ejercicio activo de la competición.
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

	-- Selector autorizado (debe pertenecer al ejercicio de la ronda activa).
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
		insert into public.group_attempts (group_id, selector_id, success, awarded_points, reason)
		values (p_group_id, p_selector_id, false, 0, 'empty');
		return jsonb_build_object('status', 'invalid_submission', 'message', 'La entrega no es válida.');
	end if;

	for v_decl in select value from jsonb_array_elements(p_declarations) loop
		if jsonb_typeof(v_decl -> 'property') <> 'string'
			or jsonb_typeof(v_decl -> 'value') <> 'string' then
			insert into public.group_attempts (group_id, selector_id, success, awarded_points, reason)
			values (p_group_id, p_selector_id, false, 0, 'malformed');
			return jsonb_build_object('status', 'invalid_submission', 'message', 'La entrega no es válida.');
		end if;
	end loop;

	-- Idempotencia: reserva la petición y devuelve la respuesta previa si ya
	-- se había procesado. El `select ... for update` serializa reintentos
	-- simultáneos del mismo request_id.
	if p_request_id is not null then
		insert into public.css_submission_requests (request_id, group_id, selector_id)
		values (p_request_id, p_group_id, p_selector_id)
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

	-- Bloquea el saldo del grupo (creando la fila si no existe) para aplicar el
	-- límite de puntuación de forma atómica frente a entregas simultáneas.
	insert into public.group_scores (group_id, total_points)
	values (p_group_id, 0)
	on conflict (group_id) do nothing;

	select total_points into v_balance
	from public.group_scores
	where group_id = p_group_id
	for update;

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

		-- Política coherente: una propiedad ya resuelta DE ESTE SELECTOR no
		-- vuelve a puntuar y tampoco se penaliza. La misma propiedad en otro
		-- selector es una regla independiente y sí puede puntuar.
		if exists (
			select 1 from public.group_property_scores
			where group_id = p_group_id
				and exercise_id = v_round.exercise_id
				and selector_id = p_selector_id
				and property_name = v_rule.property_name
		) then
			continue;
		end if;

		if (v_decl ->> 'value') = v_rule.expected_canonical then
			v_points := null;
			insert into public.group_property_scores
				(group_id, exercise_id, selector_id, property_name, points)
			values (
				p_group_id,
				v_round.exercise_id,
				p_selector_id,
				v_rule.property_name,
				v_rule.points
			)
			on conflict (group_id, exercise_id, selector_id, property_name) do nothing
			returning points into v_points;

			if v_points is not null then
				v_new_properties := v_new_properties + 1;
				v_awarded := v_awarded + v_points;
				insert into public.scoring_events
					(group_id, exercise_id, selector_id, property_name, kind, points)
				values (
					p_group_id,
					v_round.exercise_id,
					p_selector_id,
					v_rule.property_name,
					'property',
					v_points
				);
			end if;
		else
			-- Propiedad reconocida, evaluada y todavía no resuelta, con un valor
			-- distinto del esperado: cuenta para la penalización.
			v_incorrect := v_incorrect + 1;
		end if;
	end loop;

	-- ¿El selector quedó completamente puntuado con esta entrega?
	select count(*) into v_total_rules
	from public.selector_rules
	where selector_id = p_selector_id;

	if v_total_rules > 0 then
		select count(*) into v_scored
		from public.group_property_scores
		where group_id = p_group_id
			and exercise_id = v_round.exercise_id
			and selector_id = p_selector_id;
		if v_scored >= v_total_rules then
			v_fully := true;
		end if;
	end if;

	-- Bonificación por velocidad (una única vez por selector, por grupo).
	if v_fully then
		if v_settings.css_speed_bonus_points > 0
			and v_settings.css_speed_bonus_seconds > 0 then
			v_bonus_cur := null;
			insert into public.group_selector_bonuses
				(group_id, selector_id, points)
			values (p_group_id, p_selector_id, v_settings.css_speed_bonus_points)
			on conflict (group_id, selector_id) do nothing
			returning points into v_bonus_cur;

			if v_bonus_cur is not null then
				select min(created_at) into v_first_attempt
				from public.group_attempts
				where group_id = p_group_id and selector_id = p_selector_id;

				if v_first_attempt is not null then
					v_elapsed := extract(epoch from (now() - v_first_attempt));
					if v_elapsed <= v_settings.css_speed_bonus_seconds then
						insert into public.scoring_events
							(group_id, exercise_id, selector_id, property_name, kind, points)
						values (
							p_group_id,
							v_round.exercise_id,
							p_selector_id,
							null,
							'speed',
							v_settings.css_speed_bonus_points
						);
						v_awarded := v_awarded + v_settings.css_speed_bonus_points;
						v_speed_bonus := true;
					else
						delete from public.group_selector_bonuses
						where group_id = p_group_id and selector_id = p_selector_id;
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
			-- Nunca por debajo de cero: la penalización no puede consumir más
			-- que el saldo anterior más lo concedido en esta entrega.
			v_applied_penalty := least(v_intended_penalty, greatest(0, v_balance + v_awarded));
		end if;
	end if;

	if v_applied_penalty > 0 then
		insert into public.scoring_events
			(group_id, exercise_id, selector_id, property_name, kind, points)
		values (
			p_group_id,
			v_round.exercise_id,
			p_selector_id,
			null,
			'penalty',
			-v_applied_penalty
		);
	end if;

	-- El intento evaluable queda registrado (auditoría).
	insert into public.group_attempts
		(group_id, selector_id, success, awarded_points, penalty_points, net_points, new_properties, request_id, reason)
	values (
		p_group_id,
		p_selector_id,
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
