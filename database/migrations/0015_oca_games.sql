-- =============================================================================
-- 0015 — Dungeon Coder: La Oca del Caos. Persistencia inicial de partidas.
--
-- Fase 2 de la integración: permite al profesorado crear partidas y asociar
-- grupos EXISTENTES, y a cada grupo consultar únicamente las partidas en las
-- que participa. Todavía NO hay tablero, turnos, retos ni puntuación.
--
-- Alcance deliberadamente mínimo y AISLADO:
--   * Solo se crean tablas nuevas (`oca_games`, `oca_game_participants`).
--   * No se modifica ninguna tabla, función, disparador ni vista existente.
--   * Los grupos, alumnos, usuarios y sesiones de la plataforma se REUTILIZAN:
--     aquí solo se los referencia; no se duplican.
--   * La Oca escribe únicamente en sus propias tablas.
--
-- Integridad:
--   * `oca_game_participants` tiene clave primaria (game_id, group_id), que
--     impide asociar dos veces el mismo grupo a la misma partida.
--   * Las claves foráneas son explícitas. La participación se elimina en
--     cascada al borrar la partida o el grupo (coherente con la tabla de
--     participantes de la competición): borrar una partida o un grupo nunca
--     deja filas huérfanas ni bloquea el mantenimiento existente.
--   * El docente creador se guarda con `on delete set null`: eliminar una
--     cuenta de administración no borra las partidas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Partidas de La Oca. `status` solo admite el estado inicial `created`
-- (creada, todavía sin comenzar). Las transiciones de estado se añadirán en
-- fases posteriores mediante una nueva migración.
-- -----------------------------------------------------------------------------
create table public.oca_games (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	status text not null default 'created',
	created_by uuid references public.admin_users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint oca_games_name_not_blank check (length(trim(name)) > 0),
	constraint oca_games_status_check check (status in ('created'))
);

create index oca_games_created_at_idx on public.oca_games (created_at desc);

-- -----------------------------------------------------------------------------
-- Grupos participantes de cada partida. Un grupo solo puede asociarse una vez
-- por partida (clave primaria compuesta).
-- -----------------------------------------------------------------------------
create table public.oca_game_participants (
	game_id uuid not null references public.oca_games (id) on delete cascade,
	group_id uuid not null references public.groups (id) on delete cascade,
	joined_at timestamptz not null default now(),
	primary key (game_id, group_id)
);

create index oca_game_participants_group_idx
	on public.oca_game_participants (group_id);

-- -----------------------------------------------------------------------------
-- Mantiene `updated_at` con el disparador compartido existente.
-- -----------------------------------------------------------------------------
drop trigger if exists oca_games_touch_updated_at on public.oca_games;
create trigger oca_games_touch_updated_at
	before update on public.oca_games
	for each row execute function public.touch_updated_at();
