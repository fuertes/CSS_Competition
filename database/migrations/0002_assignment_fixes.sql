-- =============================================================================
-- Migración 0002: correcciones complementarias de asignación
-- =============================================================================
-- Desasigna a un alumno (lo deja sin grupo) dejando la asignación desbloqueada.
-- Solo administradores. Se registra en auditoría.
create or replace function public.clear_assignment(p_student_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
	if not public.is_admin_user(p_actor_id) then
		raise exception 'No autorizado' using errcode = '42501';
	end if;

	update public.students
	set group_id = null,
		assignment_locked = false,
		updated_at = now()
	where id = p_student_id;

	if not found then
		raise exception 'Alumno no encontrado' using errcode = 'P0002';
	end if;

	perform public.write_audit(p_actor_id, 'clear_assignment', 'students', p_student_id::text, '{}'::jsonb);
end;
$$;