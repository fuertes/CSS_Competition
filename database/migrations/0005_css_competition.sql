-- =============================================================================
-- 0005 — Competición CSS granular
--
-- Añade el modo de ejercicio "css": los grupos se autentican con un código de
-- acceso (generado por el servidor y guardado solo como hash), realizan
-- intentos ilimitados sobre selectores CSS y obtienen puntos parciales por
-- propiedad. La puntuación está protegida contra duplicados y concurrencia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Grupos: código de acceso secreto (hash + lookup con pepper). El código
-- público de 5 caracteres (groups.code) es para el profesor; este nuevo código
-- es el que introduce el grupo en el ordenador compartido.
-- -----------------------------------------------------------------------------
alter table public.groups add column access_code_lookup text;
alter table public.groups add column access_code_hash text;

create unique index groups_access_code_lookup_key
	on public.groups (access_code_lookup) where access_code_lookup is not null;

-- -----------------------------------------------------------------------------
-- Sesiones de autenticación de grupo (token aleatorio, hash SHA-256 en BD).
-- -----------------------------------------------------------------------------
create table public.group_sessions (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references public.groups (id) on delete cascade,
	token_hash text not null unique,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	last_used_at timestamptz not null default now(),
	revoked_at timestamptz
);

create index group_sessions_group_idx on public.group_sessions (group_id);
create index group_sessions_expires_idx on public.group_sessions (expires_at);

-- -----------------------------------------------------------------------------
-- Intentos de acceso por código (limitación de intentos y auditoría).
-- -----------------------------------------------------------------------------
create table public.group_login_attempts (
	id bigint generated always as identity primary key,
	code_lookup text not null,
	success boolean not null default false,
	created_at timestamptz not null default now()
);

create index group_login_attempts_code_time_idx
	on public.group_login_attempts (code_lookup, created_at desc);

-- -----------------------------------------------------------------------------
-- Ejercicios: modo "code" (juego de códigos existente) o "css" (nuevo).
-- -----------------------------------------------------------------------------
alter table public.exercises add column kind text not null default 'code'
	check (kind in ('code', 'css'));

-- -----------------------------------------------------------------------------
-- Selectores de un ejercicio CSS (el selector es información pública del
-- ejercicio; las reglas privadas viven en selector_rules).
-- -----------------------------------------------------------------------------
create table public.exercise_selectors (
	id uuid primary key default gen_random_uuid(),
	exercise_id uuid not null references public.exercises (id) on delete cascade,
	selector text not null check (length(trim(selector)) between 1 and 200),
	position integer not null default 0,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	constraint exercise_selectors_position_unique unique (exercise_id, position)
);

create index exercise_selectors_exercise_idx on public.exercise_selectors (exercise_id);

-- -----------------------------------------------------------------------------
-- Reglas privadas (soluciones): propiedad, valor canónico esperado y puntos.
-- expected_canonical se genera en el servidor (canonicalizeValue) al guardar.
-- -----------------------------------------------------------------------------
create table public.selector_rules (
	id uuid primary key default gen_random_uuid(),
	selector_id uuid not null references public.exercise_selectors (id) on delete cascade,
	property_name text not null check (length(trim(property_name)) between 1 and 60),
	expected_canonical text not null check (length(expected_canonical) between 1 and 500),
	points integer not null default 1 check (points > 0 and points <= 1000),
	created_at timestamptz not null default now(),
	constraint selector_rules_property_unique unique (selector_id, property_name)
);

create index selector_rules_selector_idx on public.selector_rules (selector_id);

-- -----------------------------------------------------------------------------
-- Propiedades puntuadas por grupo y ejercicio.
--
-- UNIQUE (group_id, exercise_id, property_name) es la última defensa contra
-- entregas simultáneas: una propiedad solo puede puntuar una vez por grupo y
-- ejercicio aunque aparezca en varios selectores.
-- -----------------------------------------------------------------------------
create table public.group_property_scores (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references public.groups (id) on delete cascade,
	exercise_id uuid not null references public.exercises (id) on delete restrict,
	selector_id uuid not null references public.exercise_selectors (id) on delete restrict,
	property_name text not null,
	points integer not null check (points > 0 and points <= 1000),
	scored_at timestamptz not null default now(),
	constraint group_property_scores_unique unique (group_id, exercise_id, property_name)
);

create index group_property_scores_group_idx on public.group_property_scores (group_id);
create index group_property_scores_exercise_idx
	on public.group_property_scores (exercise_id, group_id);

-- -----------------------------------------------------------------------------
-- Intentos de entrega CSS (auditoría; sin contenido de soluciones).
-- -----------------------------------------------------------------------------
create table public.group_attempts (
	id bigint generated always as identity primary key,
	group_id uuid not null references public.groups (id) on delete cascade,
	selector_id uuid references public.exercise_selectors (id) on delete set null,
	success boolean not null default false,
	awarded_points integer not null default 0 check (awarded_points >= 0),
	reason text,
	created_at timestamptz not null default now()
);

create index group_attempts_group_time_idx
	on public.group_attempts (group_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Eventos de puntuación (auditoría): alimentan el marcador agregado mediante
-- un trigger y conservan cuándo y cuánto se puntuó cada propiedad.
-- -----------------------------------------------------------------------------
create table public.scoring_events (
	id bigint generated always as identity primary key,
	group_id uuid not null references public.groups (id) on delete cascade,
	exercise_id uuid not null references public.exercises (id) on delete restrict,
	selector_id uuid references public.exercise_selectors (id) on delete set null,
	property_name text,
	kind text not null default 'property' check (kind in ('property', 'speed')),
	points integer not null check (points > 0),
	created_at timestamptz not null default now()
);

create index scoring_events_group_time_idx
	on public.scoring_events (group_id, created_at desc);
create index scoring_events_exercise_idx on public.scoring_events (exercise_id);

-- Marcador de bonificación por velocidad: una por grupo y selector (PK).
create table public.group_selector_bonuses (
	group_id uuid not null references public.groups (id) on delete cascade,
	selector_id uuid not null references public.exercise_selectors (id) on delete cascade,
	points integer not null check (points > 0),
	awarded_at timestamptz not null default now(),
	primary key (group_id, selector_id)
);

-- -----------------------------------------------------------------------------
-- Rondas de competición: una abierta como máximo (índice único parcial).
-- La ronda abierta define el ejercicio activo de la competición.
-- -----------------------------------------------------------------------------
create table public.competition_rounds (
	id uuid primary key default gen_random_uuid(),
	exercise_id uuid not null references public.exercises (id) on delete cascade,
	started_at timestamptz not null default now(),
	ended_at timestamptz,
	created_at timestamptz not null default now()
);

create unique index competition_rounds_single_open
	on public.competition_rounds ((1)) where ended_at is null;
create index competition_rounds_exercise_idx on public.competition_rounds (exercise_id);

-- -----------------------------------------------------------------------------
-- Configuración nueva de la competición CSS.
-- -----------------------------------------------------------------------------
alter table public.competition_settings
	add column css_login_max_attempts integer not null default 5
		check (css_login_max_attempts >= 1),
	add column css_login_window_seconds integer not null default 300
		check (css_login_window_seconds >= 10),
	add column css_speed_bonus_points integer not null default 0
		check (css_speed_bonus_points >= 0),
	add column css_speed_bonus_seconds integer not null default 120
		check (css_speed_bonus_seconds >= 0);

-- =============================================================================
-- Funciones
-- =============================================================================

-- Genera un código de acceso criptográficamente aleatorio: 8 caracteres de un
-- alfabeto de 32 símbolos (2^5) → 40 bits de entropía, sin sesgo de módulo.
-- Sin caracteres ambiguos (I, O, 0, 1).
create or replace function public.generate_group_access_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
	v_code text := '';
begin
	for i in 1..8 loop
		v_code := v_code || substr(
			'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
			(get_byte(gen_random_bytes(1), 0) & 31) + 1,
			1
		);
	end loop;
	return v_code;
end;
$$;

-- Genera (o regenera) el código de acceso de un grupo. Devuelve el código en
-- claro una única vez para que el profesor lo entregue al grupo. Solo admins.
-- Regenerar el código invalida las sesiones activas del grupo.
create or replace function public.generate_group_access_code(
	p_group_id uuid,
	p_actor_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
	v_code text;
	v_loop int := 0;
begin
	if not public.is_admin_user(p_actor_id) then
		raise exception 'No autorizado' using errcode = '42501';
	end if;
	if not exists (select 1 from public.groups where id = p_group_id) then
		raise exception 'No se encontró el grupo' using errcode = 'P0002';
	end if;

	loop
		v_code := public.generate_group_access_code();
		exit when not exists (
			select 1 from public.groups
			where access_code_lookup = public.hash_lookup(v_code)
		);
		v_loop := v_loop + 1;
		if v_loop > 50 then
			raise exception 'No se pudo generar un código único' using errcode = '22023';
		end if;
	end loop;

	update public.groups
	set access_code_lookup = public.hash_lookup(v_code),
		access_code_hash = crypt(v_code, gen_salt('bf', 10)),
		updated_at = now()
	where id = p_group_id;

	update public.group_sessions
	set revoked_at = now()
	where group_id = p_group_id and revoked_at is null;

	perform public.write_audit(
		p_actor_id,
		'generate_group_access_code',
		'groups',
		p_group_id::text
	);

	return v_code;
end;
$$;

-- Inicio de sesión de un grupo: verifica el código (bcrypt), aplica la
-- limitación de intentos fallidos y crea la sesión. Devuelve un JSONB con un
-- mensaje genérico que nunca diferencia "código incorrecto" de "grupo no
-- existe".
create or replace function public.group_login(
	p_code text,
	p_token_hash text,
	p_ttl_seconds integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
	v_lookup text := public.hash_lookup(p_code);
	v_group public.groups%rowtype;
	v_attempts int;
	v_max_attempts int;
	v_window int;
	v_settings public.competition_settings%rowtype;
begin
	select * into v_settings from public.competition_settings where id = true;
	v_max_attempts := v_settings.css_login_max_attempts;
	v_window := v_settings.css_login_window_seconds;

	select count(*) into v_attempts
	from public.group_login_attempts
	where code_lookup = v_lookup
		and success = false
		and created_at > now() - make_interval(secs => v_window);

	if v_attempts >= v_max_attempts then
		return jsonb_build_object(
			'status', 'rate_limited',
			'message', 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
		);
	end if;

	select * into v_group from public.groups where access_code_lookup = v_lookup;

	if not found then
		insert into public.group_login_attempts (code_lookup, success)
		values (v_lookup, false);
		return jsonb_build_object('status', 'invalid', 'message', 'Código incorrecto.');
	end if;

	if v_group.access_code_hash is null
		or v_group.access_code_hash <> crypt(p_code, v_group.access_code_hash) then
		insert into public.group_login_attempts (code_lookup, success)
		values (v_lookup, false);
		return jsonb_build_object('status', 'invalid', 'message', 'Código incorrecto.');
	end if;

	if not v_group.active then
		insert into public.group_login_attempts (code_lookup, success)
		values (v_lookup, false);
		return jsonb_build_object(
			'status', 'inactive',
			'message', 'El grupo no puede participar por ahora.'
		);
	end if;

	insert into public.group_login_attempts (code_lookup, success)
	values (v_lookup, true);

	delete from public.group_sessions where expires_at <= now();

	insert into public.group_sessions (group_id, token_hash, expires_at)
	values (v_group.id, p_token_hash, now() + make_interval(secs => p_ttl_seconds));

	return jsonb_build_object(
		'status', 'ok',
		'group', jsonb_build_object(
			'id', v_group.id,
			'name', v_group.name,
			'color', v_group.color
		)
	);
end;
$$;

-- Entrega de CSS de un selector. Todo ocurre en una transacción:
--   1. Valida estado del grupo, ronda abierta, ejercicio activo y selector.
--   2. Compara cada declaración contra las reglas privadas (valor canónico).
--   3. Concede puntos SOLO a las propiedades que no habían puntuado (guardado
--      por UNIQUE (group_id, exercise_id, property_name)).
--   4. Registra el intento y los eventos de puntuación.
--   5. Aplica la bonificación por velocidad (máximo una vez por selector).
-- Devuelve una respuesta genérica que no revela propiedades ni soluciones.
create or replace function public.submit_css_selector(
	p_group_id uuid,
	p_selector_id uuid,
	p_declarations jsonb
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
	v_fully boolean := false;
	v_speed_bonus boolean := false;
	v_bonus_cur integer;
	v_first_attempt timestamptz;
	v_elapsed numeric;
	v_settings public.competition_settings%rowtype;
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

	-- Selector autorizado.
	select * into v_selector
	from public.exercise_selectors
	where id = p_selector_id and exercise_id = v_round.exercise_id and active = true;
	if not found then
		return jsonb_build_object('status', 'invalid_selector', 'message', 'La entrega no es válida.');
	end if;

	if p_declarations is null
		or jsonb_typeof(p_declarations) <> 'array'
		or jsonb_array_length(p_declarations) = 0 then
		insert into public.group_attempts (group_id, selector_id, success, awarded_points, reason)
		values (p_group_id, p_selector_id, false, 0, 'empty');
		return jsonb_build_object('status', 'invalid_submission', 'message', 'La entrega no es válida.');
	end if;

	-- Evaluación contra las reglas privadas del selector.
	for v_decl in select value from jsonb_array_elements(p_declarations) loop
		if jsonb_typeof(v_decl -> 'property') <> 'string'
			or jsonb_typeof(v_decl -> 'value') <> 'string' then
			insert into public.group_attempts (group_id, selector_id, success, awarded_points, reason)
			values (p_group_id, p_selector_id, false, 0, 'malformed');
			return jsonb_build_object('status', 'invalid_submission', 'message', 'La entrega no es válida.');
		end if;

		select * into v_rule
		from public.selector_rules
		where selector_id = p_selector_id
			and property_name = lower(v_decl ->> 'property');
		if not found then
			-- Propiedad no contemplada por la solución: no puntúa ni penaliza.
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
		end if;
	end loop;

	-- El intento evaluable queda registrado (auditoría).
	insert into public.group_attempts (group_id, selector_id, success, awarded_points, reason)
	values (p_group_id, p_selector_id, v_awarded > 0, v_awarded, 'evaluated');

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
	-- La PK (group_id, selector_id) garantiza que aunque dos entregas
	-- simultáneas completen el selector a la vez solo una conceda el bonus.
	if v_fully then
		select * into v_settings from public.competition_settings where id = true;
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
						-- Fuera del umbral: se revierte el marcador reservado.
						delete from public.group_selector_bonuses
						where group_id = p_group_id and selector_id = p_selector_id;
					end if;
				end if;
			end if;
		end if;
	end if;

	return jsonb_build_object(
		'status', 'ok',
		'awarded', v_awarded,
		'new_properties', v_new_properties,
		'fully_correct', v_fully,
		'speed_bonus', v_speed_bonus,
		'message', case
			when v_speed_bonus then '¡Selector completado con bonificación!'
			when v_fully then '¡Selector completado!'
			when v_awarded > 0 then 'Has obtenido puntos.'
			else 'No has obtenido puntos.'
		end
	);
end;
$$;

-- Agregación: cada evento de puntuación actualiza el marcador del grupo
-- (total_points y última puntuación). solved_count se reserva al juego de
-- códigos; aquí no se toca.
create or replace function public.on_scoring_event_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
	insert into public.group_scores (group_id, total_points, last_scored_at, updated_at)
	values (new.group_id, new.points, new.created_at, now())
	on conflict (group_id) do update
	set total_points = public.group_scores.total_points + excluded.total_points,
		last_scored_at = greatest(
			coalesce(public.group_scores.last_scored_at, excluded.last_scored_at),
			excluded.last_scored_at
		),
		updated_at = now();
	return new;
end;
$$;

drop trigger if exists scoring_events_aggregate on public.scoring_events;
create trigger scoring_events_aggregate
	after insert on public.scoring_events
	for each row execute function public.on_scoring_event_created();

-- Abre una ronda de competición para un ejercicio CSS. Cierra la ronda que
-- hubiera abierta (máximo una). Solo admins.
create or replace function public.start_competition_round(
	p_exercise_id uuid,
	p_actor_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
	v_exercise public.exercises%rowtype;
	v_round_id uuid;
begin
	if not public.is_admin_user(p_actor_id) then
		raise exception 'No autorizado' using errcode = '42501';
	end if;

	select * into v_exercise from public.exercises where id = p_exercise_id;
	if not found then
		raise exception 'No se encontró el ejercicio' using errcode = 'P0002';
	end if;
	if v_exercise.kind <> 'css' then
		raise exception 'El ejercicio no es de tipo CSS' using errcode = '22023';
	end if;
	if v_exercise.archived or not v_exercise.active then
		raise exception 'El ejercicio debe estar activo para iniciar la ronda' using errcode = '22023';
	end if;

	update public.competition_rounds set ended_at = now() where ended_at is null;

	insert into public.competition_rounds (exercise_id)
	values (p_exercise_id)
	returning id into v_round_id;

	perform public.write_audit(
		p_actor_id,
		'start_competition_round',
		'exercises',
		p_exercise_id::text,
		jsonb_build_object('round_id', v_round_id)
	);

	return jsonb_build_object('id', v_round_id);
end;
$$;

-- Cierra la ronda activa. Solo admins.
create or replace function public.end_competition_round(p_actor_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
	v_round_id uuid;
begin
	if not public.is_admin_user(p_actor_id) then
		raise exception 'No autorizado' using errcode = '42501';
	end if;

	update public.competition_rounds set ended_at = now()
	where ended_at is null
	returning id into v_round_id;

	if v_round_id is null then
		raise exception 'No hay ninguna ronda abierta' using errcode = 'P0002';
	end if;

	perform public.write_audit(
		p_actor_id,
		'end_competition_round',
		'competition_rounds',
		v_round_id::text
	);

	return jsonb_build_object('id', v_round_id);
end;
$$;