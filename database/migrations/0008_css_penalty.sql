-- =============================================================================
-- 0008 — Penalización configurable y navegación entre selectores
--
-- Añade a la competición CSS:
--   * Configuración de penalización (ámbito competición, fila única).
--   * Eventos de puntuación con signo (los negativos son penalizaciones).
--   * Auditoría por intento (puntos positivos, penalización aplicada y neto).
--   * Idempotencia de entregas (un reintento de red no vuelve a descontar).
--   * Nueva versión de submit_css_selector que aplica la penalización con
--     bloqueo del saldo para que el límite de cero sea correcto incluso con
--     entregas simultáneas.
--
-- La fuente única de verdad de la puntuación sigue siendo la agregación de
-- scoring_events en group_scores (trigger on_scoring_event_created). La
-- penalización se guarda como un evento con puntos negativos, de modo que no
-- hay un segundo cálculo del saldo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Configuración de penalización (competición completa).
--
--    `default_points` (ya existente) es la "puntuación base por propiedad
--    correcta": el valor por defecto de las reglas nuevas (importador y alta
--    manual de reglas). Las reglas ya creadas conservan sus puntos para no
--    alterar puntuaciones registradas.
-- -----------------------------------------------------------------------------
alter table public.competition_settings
	add column penalty_enabled boolean not null default false,
	add column penalty_points integer not null default 0
		check (penalty_points >= 0 and penalty_points <= 100000),
	add column penalty_mode text not null default 'per_property'
		check (penalty_mode in ('per_property', 'per_submission')),
	add column allow_negative_score boolean not null default false;

-- -----------------------------------------------------------------------------
-- 2. Eventos de puntuación con signo.
--
--    `property` y `speed` son positivos (puntos concedidos); `penalty` es
--    negativo (puntos descontados). El saldo agregado sigue siendo la suma.
-- -----------------------------------------------------------------------------
alter table public.scoring_events
	drop constraint if exists scoring_events_kind_check,
	drop constraint if exists scoring_events_points_check;

alter table public.scoring_events
	add constraint scoring_events_kind_check
		check (kind in ('property', 'speed', 'penalty')),
	add constraint scoring_events_points_check
		check (points <> 0);

-- -----------------------------------------------------------------------------
-- 3. Auditoría por intento.
--
--    awarded_points: puntos positivos concedidos (propiedades + velocidad).
--    penalty_points: penalización realmente aplicada (>= 0).
--    net_points:     saldo neto del intento (awarded - penalty), puede ser < 0.
--    request_id:     clave de idempotencia de la petición (opcional).
-- -----------------------------------------------------------------------------
alter table public.group_attempts
	add column penalty_points integer not null default 0
		check (penalty_points >= 0),
	add column net_points integer not null default 0,
	add column new_properties integer not null default 0 check (new_properties >= 0),
	add column request_id uuid;

create index group_attempts_request_idx
	on public.group_attempts (request_id) where request_id is not null;

-- -----------------------------------------------------------------------------
-- 4. Idempotencia de entregas.
--
--    Una fila por petición (`request_id`). Guarda la respuesta JSON para
--    devolverla tal cual si la misma operación se reintenta (por ejemplo tras
--    un fallo de red), sin volver a puntuar ni penalizar.
-- -----------------------------------------------------------------------------
create table public.css_submission_requests (
	request_id uuid primary key,
	group_id uuid not null references public.groups (id) on delete cascade,
	selector_id uuid references public.exercise_selectors (id) on delete set null,
	response jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now()
);

create index css_submission_requests_group_idx
	on public.css_submission_requests (group_id);

-- -----------------------------------------------------------------------------
-- 5. Entrega de CSS con penalización, límite de cero e idempotencia.
--
--    Se elimina la versión anterior de 3 argumentos y se redefine con
--    `p_request_id` opcional (los llamadores de 3 argumentos siguen valiendo).
-- -----------------------------------------------------------------------------
drop function if exists public.submit_css_selector(uuid, uuid, jsonb);

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

		-- Política coherente: una propiedad ya resuelta no vuelve a puntuar y
		-- tampoco se penaliza (evita castigar volver a una propiedad acertada).
		if exists (
			select 1 from public.group_property_scores
			where group_id = p_group_id
				and exercise_id = v_round.exercise_id
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
			on conflict (group_id, exercise_id, property_name) do nothing
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
