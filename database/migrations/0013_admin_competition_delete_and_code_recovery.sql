-- =============================================================================
-- 0013 — Borrado de competiciones y recuperación del código de acceso de grupo.
--
-- Dos cambios independientes con una misma prioridad (integridad y seguridad):
--
-- 1) RECUPERACIÓN DEL CÓDIGO DE ACCESO DE GRUPO
--    Hasta ahora el código de acceso de un grupo se guardaba solo como
--    `access_code_lookup` (HMAC para búsqueda) y `access_code_hash` (bcrypt para
--    verificación). No era recuperable: si el profesor lo perdía debía generar
--    uno nuevo (invalidando las sesiones del grupo).
--    Se añade la columna `access_code_encrypted`, que guarda el código cifrado
--    con AES-256-GCM en la CAPA DE APLICACIÓN (clave en variable de entorno,
--    nunca en la base de datos). El hash y el lookup se conservan intactos para
--    la verificación, de modo que el acceso de los grupos no cambia.
--    Las filas existentes quedan con `access_code_encrypted` nulo: no se
--    "inventa" ni se muestra ningún código falso; habrá que regenerarlo.
--
-- 2) BORRADO REAL DE UNA COMPETICIÓN (EJECUCIÓN)
--    Una "competición" es una ejecución concreta (`competition_rounds`). Se
--    añade la función transaccional `delete_competition_round`, solo para
--    administradores, que elimina de verdad la ronda y todos sus datos
--    dependientes (participantes, intentos, puntuaciones por propiedad, eventos
--    de puntuación y bonificaciones), CONSERVANDO los grupos, sus códigos de
--    acceso y el ejercicio compartido.
--
--    Como el marcador `group_scores` se actualiza con un trigger que solo SUMA
--    al insertar, borrar los eventos de una ronda no descuenta por sí solo. Por
--    eso el borrado RECALCULA `group_scores` de los grupos afectados
--    (`recompute_group_scores`) para que no queden puntos huérfanos en el
--    ranking histórico.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Código de acceso recuperable (cifrado en la aplicación).
-- -----------------------------------------------------------------------------
alter table public.groups add column access_code_encrypted text;

-- -----------------------------------------------------------------------------
-- 2. Recalcula el marcador agregado de una lista de grupos desde sus fuentes
--    (resoluciones del juego de códigos + eventos de la competición CSS).
--
--    Es la operación inversa a los triggers `on_submission_created` /
--    `on_scoring_event_created`, necesaria tras un borrado en cascada (los
--    triggers no descuentan).
-- -----------------------------------------------------------------------------
create or replace function public.recompute_group_scores(p_group_ids uuid[])
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
	update public.group_scores gs
	set total_points = coalesce((
			select sum(s.awarded_points)
			from public.submissions s
			where s.group_id = gs.group_id
		), 0)
		+ coalesce((
			select sum(se.points)
			from public.scoring_events se
			where se.group_id = gs.group_id
		), 0),
		solved_count = coalesce((
			select count(*)
			from public.submissions s
			where s.group_id = gs.group_id
		), 0),
		last_scored_at = (
			select max(t) from (
				select max(s.submitted_at) as t
				from public.submissions s
				where s.group_id = gs.group_id
				union all
				select max(se.created_at) as t
				from public.scoring_events se
				where se.group_id = gs.group_id
			) candidatos
		),
		updated_at = now()
	where gs.group_id = any(p_group_ids);
$$;

-- -----------------------------------------------------------------------------
-- 3. Borrado real de una competición (ronda) con limpieza de datos dependientes.
--
--    - Solo administradores (defensa en profundidad: `is_admin_user`).
--    - Bloquea la ronda (`for update`) antes de borrarla: serializa borrados
--      simultáneos y hace esperar a las entregas concurrentes, cuyas claves
--      foráneas (`round_id`) fallarán una vez confirmado el borrado → ninguna
--      entrega concurrente puede generar puntos "después" del borrado.
--    - Todo ocurre en una única transacción (la propia llamada a la función):
--      si algo falla, se revierte por completo y no queda un borrado a medias.
--    - Conserva grupos, códigos de acceso y el ejercicio compartido; solo
--      elimina lo que pertenece a esa ejecución.
-- -----------------------------------------------------------------------------
create or replace function public.delete_competition_round(
	p_round_id uuid,
	p_actor_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
	v_round public.competition_rounds%rowtype;
	v_exercise_title text;
	v_was_open boolean;
	v_participants int;
	v_events int;
	v_groups uuid[];
begin
	if not public.is_admin_user(p_actor_id) then
		raise exception 'No autorizado' using errcode = '42501';
	end if;

	select * into v_round
	from public.competition_rounds
	where id = p_round_id
	for update;
	if not found then
		raise exception 'No se encontró la competición' using errcode = 'P0002';
	end if;

	select title into v_exercise_title
	from public.exercises where id = v_round.exercise_id;

	v_was_open := v_round.ended_at is null;

	select count(*)::int into v_participants
	from public.competition_participants where round_id = p_round_id;

	select count(*)::int into v_events
	from public.scoring_events where round_id = p_round_id;

	-- Grupos con cualquier registro asociado a esta competición. Su marcador
	-- debe recalcularse tras el borrado para no conservar puntos huérfanos.
	select array_agg(distinct afectado) into v_groups
	from (
		select group_id as afectado from public.scoring_events where round_id = p_round_id
		union
		select group_id from public.group_property_scores where round_id = p_round_id
		union
		select group_id from public.group_attempts where round_id = p_round_id
		union
		select group_id from public.group_selector_bonuses where round_id = p_round_id
		union
		select group_id from public.competition_participants where round_id = p_round_id
	) registros
	where afectado is not null;

	-- Borrado real: los registros con `round_id` caen en cascada. Las
	-- solicitudes idempotentes (`css_submission_requests`) quedan con
	-- `round_id` nulo (no se pierde el registro de idempotencia).
	delete from public.competition_rounds where id = p_round_id;

	-- Recalcular los marcadores afectados (los triggers no descuentan).
	if v_groups is not null then
		perform public.recompute_group_scores(v_groups);
	end if;

	perform public.write_audit(
		p_actor_id,
		'delete_competition_round',
		'competition_rounds',
		p_round_id::text,
		jsonb_build_object(
			'exercise_id', v_round.exercise_id,
			'exercise_title', v_exercise_title,
			'was_open', v_was_open,
			'participants', v_participants,
			'scoring_events', v_events,
			'groups_recomputed', coalesce(array_length(v_groups, 1), 0)
		)
	);

	return jsonb_build_object(
		'id', p_round_id,
		'exerciseId', v_round.exercise_id,
		'exerciseTitle', v_exercise_title,
		'wasOpen', v_was_open,
		'participants', v_participants,
		'scoringEvents', v_events,
		'groupsRecomputed', coalesce(array_length(v_groups, 1), 0)
	);
end;
$$;
