-- =============================================================================
-- 0016 — Dungeon Coder: La Oca del Caos. Posiciones persistentes en el tablero.
--
-- Fase 3: cada grupo participante de una partida tiene una posición persistente
-- en el tablero de 40 casillas.
--
-- Alcance deliberadamente mínimo y AISLADO:
--   * Se AMPLÍA la tabla `oca_game_participants` creada en la migración 0015
--     con el mínimo cambio necesario: una sola columna, `position`. No se crea
--     una segunda relación para representar a los mismos participantes.
--   * No se modifica ninguna migración anterior (0015 incluida), ni ninguna
--     tabla, función, disparador o vista existente.
--   * La Oca sigue escribiendo únicamente en sus propias tablas `oca_*`.
--
-- Dependencia: requiere que la migración 0015 (`oca_games` y
-- `oca_game_participants`) esté aplicada. El mecanismo de migraciones aplica
-- los archivos en orden, de modo que 0015 se ejecuta antes que 0016.
--
-- Integridad:
--   * La posición inicial es la 1 (`default 1`): las filas existentes y las
--     nuevas parten de la casilla inicial de forma consistente.
--   * `check (position between 1 and 40)` garantiza que toda posición persistida
--     identifica una casilla válida del tablero. El valor 40 replica
--     `OCA_BOARD_SIZE` de `src/lib/oca/board.ts` (definición versionada en
--     código); mantenerlos alineados forma parte de la revisión de cada fase.
--   * La clave primaria `(game_id, group_id)` de 0015 ya asegura una ÚNICA
--     posición por grupo y partida; la posición de un grupo en una partida es
--     independiente de sus posiciones en otras partidas.
-- =============================================================================

alter table public.oca_game_participants
	add column position integer not null default 1;

alter table public.oca_game_participants
	add constraint oca_game_participants_position_range
	check (position between 1 and 40);

comment on column public.oca_game_participants.position is
	'Casilla del tablero (1..40) en la que se encuentra el grupo. La posición inicial es la 1. Fase 3: solo lectura; el movimiento se añadirá en fases posteriores.';
