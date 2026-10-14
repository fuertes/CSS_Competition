-- =============================================================================
-- 0014 — Mantenimiento de datos: purga masiva de grupos y alumnos.
--
-- Herramienta administrativa para limpiar datos de PRUEBA antes de migrar las
-- funcionalidades a otro proyecto. Se puede eliminar:
--   * todos los grupos                (`scope = 'groups'`),
--   * todos los alumnos               (`scope = 'students'`),
--   * ambos de forma atómica          (`scope = 'both'`).
--
-- Qué se CONSERVA siempre (nunca se toca):
--   * Ejercicios CSS, selectores y reglas (soluciones de referencia).
--   * Competiciones (`competition_rounds`): las ejecuciones se mantienen; lo
--     que desaparece es el resultado por grupo/alumno, que no puede existir sin
--     su grupo o alumno (FK `NOT NULL ... CASCADE` / `RESTRICT`).
--   * Configuración (`competition_settings`, `app_secrets`).
--   * Cuentas y sesiones de administración (`admin_users`, `admin_sessions`).
--   * Los alumnos al eliminar solo grupos: quedan SIN grupo, no se borran.
--
-- Historial inseparable (decisión explícita y documentada):
--   Las puntuaciones dependen de la entidad con claves foráneas no anulables.
--   `submissions` (juego de códigos) referencia grupo y alumno con
--   ON DELETE RESTRICT: es imposible borrar la entidad conservándolas. La purga
--   las elimina de forma explícita y devuelve el recuento exacto para que la
--   interfaz lo muestre antes de confirmar. La operación exige una frase de
--   confirmación escrita y solo la ejecuta un administrador autenticado.
--
-- Seguridad e integridad:
--   * `security definer` + `is_admin_user` (defensa en profundidad).
--   * Validación del ámbito y de la frase de confirmación en el servidor.
--   * Bloqueo `ACCESS EXCLUSIVE` de groups/students/submissions: serializa
--     purgas simultáneas y bloquea escrituras concurrentes (incluidas las
--     comprobaciones de FK de las tablas hijas) durante la operación.
--   * Todo ocurre en una única transacción (la propia llamada a la función).
--   * Auditoría en `audit_log` (actor, tipo, alcance y recuentos).
-- =============================================================================

create or replace function public.purge_entities(
	p_scope text,
	p_confirmation text,
	p_actor_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
	v_groups int := 0;
	v_students int := 0;
	v_submissions int := 0;
	v_scoring_events int := 0;
	v_property_scores int := 0;
	v_group_attempts int := 0;
	v_participants int := 0;
	v_group_sessions int := 0;
	v_recomputed int := 0;
	v_affected uuid[];
	v_expected text;
	v_action text;
begin
	if not public.is_admin_user(p_actor_id) then
		raise exception 'No autorizado' using errcode = '42501';
	end if;

	if p_scope is null or p_scope not in ('groups', 'students', 'both') then
		raise exception 'Ámbito de mantenimiento no válido' using errcode = '22023';
	end if;

	v_expected := case p_scope
		when 'groups' then 'ELIMINAR TODOS LOS GRUPOS'
		when 'students' then 'ELIMINAR TODOS LOS ALUMNOS'
		else 'VACIAR GRUPOS Y ALUMNOS'
	end;

	if p_confirmation is null or p_confirmation <> v_expected then
		raise exception 'La confirmación no coincide' using errcode = '22023';
	end if;

	-- Serializa purgas simultáneas y bloquea escrituras concurrentes sobre las
	-- entidades que se van a eliminar (las FK de las tablas hijas toman un
	-- bloqueo ROW SHARE del padre, por lo que quedan en espera).
	lock table public.groups in access exclusive mode;
	lock table public.students in access exclusive mode;
	lock table public.submissions in access exclusive mode;

	-- Recuentos calculados SIEMPRE en el servidor (nunca se confía en el cliente).
	select count(*)::int into v_groups from public.groups;
	select count(*)::int into v_students from public.students;
	select count(*)::int into v_submissions from public.submissions;
	select count(*)::int into v_scoring_events from public.scoring_events;
	select count(*)::int into v_property_scores from public.group_property_scores;
	select count(*)::int into v_group_attempts from public.group_attempts;
	select count(*)::int into v_participants from public.competition_participants;
	select count(*)::int into v_group_sessions from public.group_sessions;

	-- Grupos que conservan su marcador (ámbito "students"): tras borrar las
	-- resoluciones hay que recalcularlo porque el trigger solo suma al insertar.
	if p_scope = 'students' then
		select array_agg(distinct s.group_id) into v_affected
		from public.submissions s
		where s.group_id is not null;
	end if;

	-- 1) Resoluciones del juego de códigos. Referencian grupo y alumno con
	--    ON DELETE RESTRICT: se eliminan explícitamente porque no pueden
	--    sobrevivir sin la entidad. En todos los ámbitos se borran todas (cada
	--    resolución pertenece a un grupo y a un alumno que se van a eliminar).
	delete from public.submissions;

	-- 2) Grupos. Arrastra en cascada su marcador, sesiones, intentos,
	--    puntuaciones, eventos, participantes y solicitudes idempotentes.
	--    `students.group_id` pasa a NULL (los alumnos no se borran).
	if p_scope in ('groups', 'both') then
		delete from public.groups;
	end if;

	-- 3) Alumnos. Arrastra en cascada sus intentos de envío.
	if p_scope in ('students', 'both') then
		delete from public.students;
	end if;

	-- Recalcula el marcador de los grupos que siguen existiendo.
	if p_scope = 'students' and v_affected is not null then
		perform public.recompute_group_scores(v_affected);
		v_recomputed := array_length(v_affected, 1);
	end if;

	v_action := case p_scope
		when 'groups' then 'purge_all_groups'
		when 'students' then 'purge_all_students'
		else 'purge_groups_and_students'
	end;

	perform public.write_audit(
		p_actor_id,
		v_action,
		'maintenance',
		p_scope,
		jsonb_build_object(
			'scope', p_scope,
			'groups_deleted', case when p_scope in ('groups', 'both') then v_groups else 0 end,
			'students_deleted', case when p_scope in ('students', 'both') then v_students else 0 end,
			'submissions_deleted', v_submissions,
			'scoring_events_deleted', case when p_scope in ('groups', 'both') then v_scoring_events else 0 end,
			'property_scores_deleted', case when p_scope in ('groups', 'both') then v_property_scores else 0 end,
			'group_attempts_deleted', case when p_scope in ('groups', 'both') then v_group_attempts else 0 end,
			'participants_deleted', case when p_scope in ('groups', 'both') then v_participants else 0 end,
			'group_sessions_deleted', case when p_scope in ('groups', 'both') then v_group_sessions else 0 end,
			'groups_recomputed', v_recomputed
		)
	);

	return jsonb_build_object(
		'scope', p_scope,
		'groupsDeleted', case when p_scope in ('groups', 'both') then v_groups else 0 end,
		'studentsDeleted', case when p_scope in ('students', 'both') then v_students else 0 end,
		'submissionsDeleted', v_submissions,
		'scoringEventsDeleted', case when p_scope in ('groups', 'both') then v_scoring_events else 0 end,
		'propertyScoresDeleted', case when p_scope in ('groups', 'both') then v_property_scores else 0 end,
		'groupAttemptsDeleted', case when p_scope in ('groups', 'both') then v_group_attempts else 0 end,
		'participantsDeleted', case when p_scope in ('groups', 'both') then v_participants else 0 end,
		'groupSessionsDeleted', case when p_scope in ('groups', 'both') then v_group_sessions else 0 end,
		'groupsRecomputed', v_recomputed
	);
end;
$$;
