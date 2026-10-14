-- =============================================================================
-- Migración 0003: mantenimiento de sesiones administrativas
-- =============================================================================
-- Utilidades de ciclo de vida de las sesiones del panel. Se invocan desde el
-- servidor (scripts o tareas programadas); ninguna es accesible al navegador.

-- Elimina las sesiones caducadas. Devuelve el número de sesiones borradas.
create or replace function public.cleanup_expired_admin_sessions()
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
	with deleted as (
		delete from public.admin_sessions where expires_at <= now() returning 1
	)
	select count(*)::int from deleted;
$$;

-- Revoca todas las sesiones activas de un administrador (p. ej. al cambiar la
-- contraseña). Devuelve el número de sesiones revocadas.
create or replace function public.revoke_admin_sessions(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
	with deleted as (
		delete from public.admin_sessions where user_id = p_user_id returning 1
	)
	select count(*)::int from deleted;
$$;

-- Cuenta las sesiones vigentes de un administrador.
create or replace function public.count_active_admin_sessions(p_user_id uuid)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
	select count(*)::int from public.admin_sessions
	where user_id = p_user_id and expires_at > now();
$$;