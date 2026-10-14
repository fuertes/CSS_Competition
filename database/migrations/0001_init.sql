-- =============================================================================
-- Plataforma educativa de competición por equipos
-- Migración 0001: esquema, restricciones, funciones atómicas y vista de ranking.
-- =============================================================================
-- PostgreSQL local (Docker). Requiere PostgreSQL 15+.
-- El runner (`scripts/migrate.mjs`) aplica este archivo dentro de una
-- transacción y registra la versión en `schema_migrations`.
-- =============================================================================

-- Extensiones necesarias: criptografía (bcrypt, hmac, digest, gen_random_bytes).
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tabla interna de secretos (pepper de lookup). Solo se usa desde el servidor;
-- el navegador jamás consulta esta tabla.
-- -----------------------------------------------------------------------------
create table public.app_secrets (
	key text primary key,
	value text not null
);

insert into public.app_secrets (key, value)
values ('lookup_pepper', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Administradores (usuarios del panel). Contraseñas hasheadas con bcrypt.
-- -----------------------------------------------------------------------------
create table public.admin_users (
	id uuid primary key default gen_random_uuid(),
	email text not null unique,
	password_hash text not null,
	display_name text,
	role text not null default 'admin' check (role in ('admin')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint admin_users_email_not_blank check (length(trim(email)) > 0)
);

-- -----------------------------------------------------------------------------
-- Sesiones de administrador. Token aleatorio cuyo hash (SHA-256) se guarda
-- aquí; el token en claro solo vive en la cookie HttpOnly del navegador.
-- -----------------------------------------------------------------------------
create table public.admin_sessions (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references public.admin_users (id) on delete cascade,
	token_hash text not null unique,
	created_at timestamptz not null default now(),
	expires_at timestamptz not null,
	last_used_at timestamptz not null default now()
);

create index admin_sessions_user_idx on public.admin_sessions (user_id);
create index admin_sessions_expires_idx on public.admin_sessions (expires_at);

-- -----------------------------------------------------------------------------
-- Grupos
-- -----------------------------------------------------------------------------
create table public.groups (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	color text not null default '#6366f1',
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint groups_name_unique unique (name),
	constraint groups_name_not_blank check (length(trim(name)) > 0)
);

-- -----------------------------------------------------------------------------
-- Alumnos. Un alumno pertenece a un único grupo (group_id). La confirmación
-- de asignación bloquea el cambio por la vía ordinaria (assignment_locked).
-- -----------------------------------------------------------------------------
create table public.students (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	access_code_lookup text, -- hmac(pepper, codigo) para búsqueda indexada
	access_code_hash text,   -- bcrypt(codigo) para verificación
	group_id uuid references public.groups (id) on delete set null,
	assignment_locked boolean not null default false,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint students_name_not_blank check (length(trim(name)) > 0)
);

create unique index students_access_code_lookup_key
	on public.students (access_code_lookup)
	where access_code_lookup is not null;

-- -----------------------------------------------------------------------------
-- Ejercicios. El código nunca viaja en claro: lookup (HMAC) + hash (bcrypt).
-- `code_set` permite a la interfaz saber si hay código sin revelarlo.
-- -----------------------------------------------------------------------------
create table public.exercises (
	id uuid primary key default gen_random_uuid(),
	title text not null,
	description text,
	code_lookup text, -- hmac(pepper, codigo) para búsqueda indexada
	code_hash text,   -- bcrypt(codigo) para verificación
	code_set boolean not null default false,
	points integer not null default 100 check (points > 0),
	active boolean not null default true,
	archived boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint exercises_title_not_blank check (length(trim(title)) > 0)
);

create unique index exercises_code_lookup_key
	on public.exercises (code_lookup)
	where code_lookup is not null;

-- -----------------------------------------------------------------------------
-- Resoluciones (historial auditable). El UNIQUE impide doble puntuación por
-- grupo y ejercicio, incluso con peticiones simultáneas.
-- -----------------------------------------------------------------------------
create table public.submissions (
	id uuid primary key default gen_random_uuid(),
	student_id uuid not null references public.students (id) on delete restrict,
	group_id uuid not null references public.groups (id) on delete restrict,
	exercise_id uuid not null references public.exercises (id) on delete restrict,
	awarded_points integer not null check (awarded_points >= 0),
	submitted_at timestamptz not null default now(),
	constraint submissions_group_exercise_unique unique (group_id, exercise_id)
);

create index submissions_group_idx on public.submissions (group_id);
create index submissions_exercise_idx on public.submissions (exercise_id);
create index submissions_submitted_at_idx on public.submissions (submitted_at);

-- -----------------------------------------------------------------------------
-- Marcador agregado por grupo (fuente del ranking). Lo mantiene un trigger.
-- -----------------------------------------------------------------------------
create table public.group_scores (
	group_id uuid primary key references public.groups (id) on delete cascade,
	total_points integer not null default 0,
	solved_count integer not null default 0,
	last_scored_at timestamptz,
	updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Intentos de envío (límite de frecuencia y auditoría de fallos)
-- -----------------------------------------------------------------------------
create table public.submission_attempts (
	id bigint generated always as identity primary key,
	student_id uuid references public.students (id) on delete cascade,
	exercise_id uuid references public.exercises (id) on delete set null,
	success boolean not null default false,
	created_at timestamptz not null default now()
);

create index submission_attempts_student_time_idx
	on public.submission_attempts (student_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Auditoría de acciones administrativas
-- -----------------------------------------------------------------------------
create table public.audit_log (
	id bigint generated always as identity primary key,
	actor_id uuid references public.admin_users (id) on delete set null,
	action text not null,
	entity text not null,
	entity_id text,
	details jsonb,
	created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);

-- -----------------------------------------------------------------------------
-- Configuración de la competición (fila única)
-- -----------------------------------------------------------------------------
create table public.competition_settings (
	id boolean primary key default true check (id),
	name text not null default 'Competición por equipos',
	default_points integer not null default 100 check (default_points > 0),
	assignments_locked_by_default boolean not null default true,
	allow_admin_assignment_correction boolean not null default false,
	submission_max_attempts integer not null default 10 check (submission_max_attempts > 0),
	submission_window_seconds integer not null default 300 check (submission_window_seconds > 0),
	updated_at timestamptz not null default now()
);

insert into public.competition_settings (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Funciones auxiliares
-- -----------------------------------------------------------------------------

-- Hash determinista (con pepper secreto) para búsquedas indexadas.
create or replace function public.hash_lookup(p_value text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
	select encode(
		hmac(upper(trim(p_value)), (select value from public.app_secrets where key = 'lookup_pepper'), 'sha256'),
		'hex'
	);
$$;

-- ¿El actor es un administrador válido? (defensa en profundidad: además de la
-- autorización que ya aplica el middleware/API, las funciones privilegiadas
-- vuelven a comprobarlo.)
create or replace function public.is_admin_user(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
	select exists (
		select 1 from public.admin_users u
		where u.id = p_actor_id and u.role = 'admin'
	);
$$;

-- Mantiene updated_at en las tablas que lo tengan.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

-- Registra una entrada de auditoría para un actor administrativo.
create or replace function public.write_audit(
	p_actor_id uuid,
	p_action text,
	p_entity text,
	p_entity_id text,
	p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
	insert into public.audit_log (actor_id, action, entity, entity_id, details)
	values (p_actor_id, p_action, p_entity, p_entity_id, p_details);
$$;

-- -----------------------------------------------------------------------------
-- Triggers de updated_at
-- -----------------------------------------------------------------------------
drop trigger if exists groups_touch_updated_at on public.groups;
create trigger groups_touch_updated_at
	before update on public.groups
	for each row execute function public.touch_updated_at();

drop trigger if exists students_touch_updated_at on public.students;
create trigger students_touch_updated_at
	before update on public.students
	for each row execute function public.touch_updated_at();

drop trigger if exists exercises_touch_updated_at on public.exercises;
create trigger exercises_touch_updated_at
	before update on public.exercises
	for each row execute function public.touch_updated_at();

drop trigger if exists admin_users_touch_updated_at on public.admin_users;
create trigger admin_users_touch_updated_at
	before update on public.admin_users
	for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Marcador: al crear un grupo se crea su fila de puntuación.
-- Al insertar una resolución se actualiza el marcador de forma transaccional.
-- -----------------------------------------------------------------------------
create or replace function public.on_group_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
	insert into public.group_scores (group_id) values (new.id)
	on conflict (group_id) do nothing;
	return new;
end;
$$;

drop trigger if exists groups_create_score on public.groups;
create trigger groups_create_score
	after insert on public.groups
	for each row execute function public.on_group_created();

insert into public.group_scores (group_id)
select id from public.groups
on conflict (group_id) do nothing;

create or replace function public.on_submission_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
	insert into public.group_scores (group_id, total_points, solved_count, last_scored_at, updated_at)
	values (new.group_id, new.awarded_points, 1, new.submitted_at, now())
	on conflict (group_id) do update
		set total_points = public.group_scores.total_points + excluded.total_points,
			solved_count = public.group_scores.solved_count + 1,
			last_scored_at = excluded.last_scored_at,
			updated_at = now();
	return new;
end;
$$;

drop trigger if exists submissions_update_score on public.submissions;
create trigger submissions_update_score
	after insert on public.submissions
	for each row execute function public.on_submission_created();

-- -----------------------------------------------------------------------------
-- Gestión de códigos (solo administradores, vía sesión del panel)
-- -----------------------------------------------------------------------------

-- Asigna/actualiza el código de un ejercicio (se guarda hasheado, nunca en claro).
create or replace function public.set_exercise_code(p_exercise_id uuid, p_code text, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
	if not public.is_admin_user(p_actor_id) then
		raise exception 'No autorizado' using errcode = '42501';
	end if;
	if p_code is null or length(trim(p_code)) = 0 then
		raise exception 'El código no puede estar vacío' using errcode = '22023';
	end if;

	update public.exercises
	set code_lookup = public.hash_lookup(p_code),
		code_hash = crypt(upper(trim(p_code)), gen_salt('bf', 10)),
		code_set = true,
		updated_at = now()
	where id = p_exercise_id;

	if not found then
		raise exception 'Ejercicio no encontrado' using errcode = 'P0002';
	end if;

	perform public.write_audit(p_actor_id, 'set_exercise_code', 'exercises', p_exercise_id::text, '{}'::jsonb);
end;
$$;

-- Asigna/actualiza el código de acceso de un alumno.
create or replace function public.set_student_access_code(p_student_id uuid, p_code text, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
	if not public.is_admin_user(p_actor_id) then
		raise exception 'No autorizado' using errcode = '42501';
	end if;
	if p_code is null or length(trim(p_code)) = 0 then
		raise exception 'El código no puede estar vacío' using errcode = '22023';
	end if;

	update public.students
	set access_code_lookup = public.hash_lookup(p_code),
		access_code_hash = crypt(upper(trim(p_code)), gen_salt('bf', 10)),
		updated_at = now()
	where id = p_student_id;

	if not found then
		raise exception 'Alumno no encontrado' using errcode = 'P0002';
	end if;

	perform public.write_audit(p_actor_id, 'set_student_access_code', 'students', p_student_id::text, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Asignación de alumnos a grupos (bloqueada por defecto, con corrección opcional)
-- -----------------------------------------------------------------------------

-- Confirma una asignación. Bloquea la fila para evitar carreras y duplicados.
create or replace function public.confirm_assignment(p_student_id uuid, p_group_id uuid, p_actor_id uuid)
returns public.students
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
	v_student public.students%rowtype;
	v_group public.groups%rowtype;
	v_settings public.competition_settings%rowtype;
begin
	if not public.is_admin_user(p_actor_id) then
		raise exception 'No autorizado' using errcode = '42501';
	end if;

	select * into v_settings from public.competition_settings where id = true;

	select * into v_student from public.students where id = p_student_id for update;
	if not found then
		raise exception 'Alumno no encontrado' using errcode = 'P0002';
	end if;

	select * into v_group from public.groups where id = p_group_id;
	if not found then
		raise exception 'Grupo no encontrado' using errcode = 'P0002';
	end if;

	-- Una asignación ya confirmada y bloqueada no puede modificarse por la vía ordinaria.
	if v_student.assignment_locked and v_student.group_id is distinct from p_group_id then
		raise exception 'La asignación ya está bloqueada. Usa la corrección excepcional.'
			using errcode = '23514';
	end if;

	update public.students
	set group_id = p_group_id,
		assignment_locked = coalesce(v_settings.assignments_locked_by_default, true),
		updated_at = now()
	where id = p_student_id
	returning * into v_student;

	perform public.write_audit(
		p_actor_id, 'confirm_assignment', 'students', p_student_id::text,
		jsonb_build_object('group_id', p_group_id)
	);

	return v_student;
end;
$$;

-- Corrección excepcional de una asignación bloqueada. Requiere habilitarla en la
-- configuración y deja registro de auditoría con el motivo.
create or replace function public.correct_assignment(
	p_student_id uuid,
	p_group_id uuid,
	p_reason text,
	p_actor_id uuid
)
returns public.students
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
	v_student public.students%rowtype;
	v_settings public.competition_settings%rowtype;
begin
	if not public.is_admin_user(p_actor_id) then
		raise exception 'No autorizado' using errcode = '42501';
	end if;

	select * into v_settings from public.competition_settings where id = true;
	if not v_settings.allow_admin_assignment_correction then
		raise exception 'La corrección de asignaciones está deshabilitada'
			using errcode = '42501';
	end if;

	if p_reason is null or length(trim(p_reason)) < 3 then
		raise exception 'Debes indicar un motivo' using errcode = '22023';
	end if;

	select * into v_student from public.students where id = p_student_id for update;
	if not found then
		raise exception 'Alumno no encontrado' using errcode = 'P0002';
	end if;

	update public.students
	set group_id = p_group_id,
		assignment_locked = true,
		updated_at = now()
	where id = p_student_id
	returning * into v_student;

	perform public.write_audit(
		p_actor_id, 'correct_assignment', 'students', p_student_id::text,
		jsonb_build_object('group_id', p_group_id, 'reason', p_reason)
	);

	return v_student;
end;
$$;

-- -----------------------------------------------------------------------------
-- Validación de códigos y puntuación (operación atómica y segura)
-- -----------------------------------------------------------------------------
create or replace function public.submit_exercise_code(
	p_student_code text,
	p_exercise_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
	v_student public.students%rowtype;
	v_group public.groups%rowtype;
	v_exercise public.exercises%rowtype;
	v_settings public.competition_settings%rowtype;
	v_points integer;
	v_attempts integer;
	v_existing_id uuid;
begin
	if p_student_code is null or length(trim(p_student_code)) = 0 then
		return jsonb_build_object('status', 'invalid_student', 'message', 'Introduce tu código de alumno.');
	end if;
	if p_exercise_code is null or length(trim(p_exercise_code)) = 0 then
		return jsonb_build_object('status', 'invalid_code', 'message', 'Introduce el código del ejercicio.');
	end if;

	select * into v_settings from public.competition_settings where id = true;

	select * into v_student
	from public.students
	where access_code_lookup = public.hash_lookup(p_student_code)
	limit 1;

	if not found then
		return jsonb_build_object('status', 'invalid_student', 'message', 'El código de alumno no es válido.');
	end if;

	-- Verificación bcrypt (defensa en profundidad frente a colisiones de lookup).
	if v_student.access_code_hash is null
		or crypt(upper(trim(p_student_code)), v_student.access_code_hash) <> v_student.access_code_hash then
		return jsonb_build_object('status', 'invalid_student', 'message', 'El código de alumno no es válido.');
	end if;

	-- Límite de intentos fallidos por ventana temporal.
	select count(*) into v_attempts
	from public.submission_attempts
	where student_id = v_student.id
		and success = false
		and created_at > now() - make_interval(secs => coalesce(v_settings.submission_window_seconds, 300));

	if v_attempts >= coalesce(v_settings.submission_max_attempts, 10) then
		return jsonb_build_object('status', 'rate_limited',
			'message', 'Demasiados intentos. Espera unos minutos antes de volver a probar.');
	end if;

	if not v_student.active then
		insert into public.submission_attempts (student_id, success) values (v_student.id, false);
		return jsonb_build_object('status', 'inactive_student', 'message', 'Tu cuenta está inactiva.');
	end if;

	if v_student.group_id is null then
		insert into public.submission_attempts (student_id, success) values (v_student.id, false);
		return jsonb_build_object('status', 'no_group', 'message', 'Todavía no tienes un grupo asignado.');
	end if;

	select * into v_group from public.groups where id = v_student.group_id;
	if not found or not v_group.active then
		insert into public.submission_attempts (student_id, success) values (v_student.id, false);
		return jsonb_build_object('status', 'inactive_group', 'message', 'Tu grupo no está activo.');
	end if;

	select * into v_exercise
	from public.exercises
	where code_lookup = public.hash_lookup(p_exercise_code)
		and active = true
		and archived = false
	limit 1;

	if not found then
		insert into public.submission_attempts (student_id, success) values (v_student.id, false);
		return jsonb_build_object('status', 'wrong_code', 'message', 'Código incorrecto.');
	end if;

	if v_exercise.code_hash is null
		or crypt(upper(trim(p_exercise_code)), v_exercise.code_hash) <> v_exercise.code_hash then
		insert into public.submission_attempts (student_id, success) values (v_student.id, false);
		return jsonb_build_object('status', 'wrong_code', 'message', 'Código incorrecto.');
	end if;

	-- ¿El grupo ya resolvió este ejercicio?
	select id into v_existing_id
	from public.submissions
	where group_id = v_group.id and exercise_id = v_exercise.id;

	if v_existing_id is not null then
		insert into public.submission_attempts (student_id, exercise_id, success) values (v_student.id, v_exercise.id, true);
		return jsonb_build_object('status', 'already_solved', 'points', 0,
			'message', 'Tu grupo ya había resuelto este ejercicio.');
	end if;

	v_points := coalesce(v_exercise.points, 100);

	-- La restricción UNIQUE protege ante envíos simultáneos.
	begin
		insert into public.submissions (student_id, group_id, exercise_id, awarded_points)
		values (v_student.id, v_group.id, v_exercise.id, v_points);
	exception when unique_violation then
		return jsonb_build_object('status', 'already_solved', 'points', 0,
			'message', 'Tu grupo ya había resuelto este ejercicio.');
	end;

	insert into public.submission_attempts (student_id, exercise_id, success)
	values (v_student.id, v_exercise.id, true);

	return jsonb_build_object(
		'status', 'success',
		'message', '¡Correcto! Has sumado puntos a tu grupo.',
		'points', v_points,
		'group_id', v_group.id,
		'exercise_id', v_exercise.id
	);
end;
$$;

-- -----------------------------------------------------------------------------
-- Portal del alumno: identifica al alumno por su código y devuelve su grupo
-- e historial, sin exponer nunca la tabla de alumnos ni los códigos.
-- -----------------------------------------------------------------------------
create or replace function public.student_portal(p_student_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
	v_student public.students%rowtype;
	v_group public.groups%rowtype;
	v_completed jsonb;
	v_pending jsonb;
begin
	if p_student_code is null or length(trim(p_student_code)) = 0 then
		return jsonb_build_object('status', 'invalid_student', 'message', 'Introduce tu código de alumno.');
	end if;

	select * into v_student
	from public.students
	where access_code_lookup = public.hash_lookup(p_student_code)
	limit 1;

	if not found
		or v_student.access_code_hash is null
		or crypt(upper(trim(p_student_code)), v_student.access_code_hash) <> v_student.access_code_hash then
		return jsonb_build_object('status', 'invalid_student', 'message', 'El código de alumno no es válido.');
	end if;

	if v_student.group_id is not null then
		select * into v_group from public.groups where id = v_student.group_id;
	end if;

	select coalesce(jsonb_agg(jsonb_build_object(
			'exercise_id', e.id,
			'title', e.title,
			'points', s.awarded_points,
			'submitted_at', s.submitted_at
		) order by s.submitted_at desc), '[]'::jsonb)
	into v_completed
	from public.submissions s
	join public.exercises e on e.id = s.exercise_id
	where v_student.group_id is not null and s.group_id = v_student.group_id;

	select coalesce(jsonb_agg(jsonb_build_object(
			'id', e.id,
			'title', e.title,
			'description', e.description,
			'points', e.points
		) order by e.created_at), '[]'::jsonb)
	into v_pending
	from public.exercises e
	where e.active = true and e.archived = false
		and not exists (
			select 1 from public.submissions s
			where s.exercise_id = e.id and s.group_id = v_student.group_id
		);

	return jsonb_build_object(
		'status', 'ok',
		'student', jsonb_build_object(
			'id', v_student.id,
			'name', v_student.name,
			'active', v_student.active
		),
		'group', case when v_group.id is null then null else jsonb_build_object(
			'id', v_group.id,
			'name', v_group.name,
			'color', v_group.color
		) end,
		'completed', v_completed,
		'pending', v_pending
	);
end;
$$;

-- -----------------------------------------------------------------------------
-- Ranking público (vista sin datos sensibles)
-- -----------------------------------------------------------------------------
create or replace view public.ranking
as
select
	g.id as group_id,
	g.name,
	g.color,
	g.active,
	coalesce(gs.total_points, 0) as total_points,
	coalesce(gs.solved_count, 0) as solved_count,
	gs.last_scored_at,
	coalesce(gs.updated_at, g.created_at) as updated_at
from public.groups g
left join public.group_scores gs on gs.group_id = g.id;