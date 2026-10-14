-- =============================================================================
-- 0009 — Puntos base por propiedad correcta (competición CSS).
--
-- Separa el concepto \"puntos base por propiedad correcta\" del genérico
-- `default_points` (que es el valor por defecto de ejercicios nuevos). Así cada
-- ajuste tiene un único significado y la sección \"Sistema de puntuación\" del
-- panel no reutiliza un campo con dos interpretaciones.
--
-- Este valor es el punto de partida de las reglas CSS NUEVAS (importador y alta
-- manual de reglas). Las reglas ya creadas conservan `selector_rules.points`,
-- que sigue siendo la fuente autoritativa de la puntuación por propiedad: así
-- no se alteran puntuaciones ya registradas.
-- =============================================================================

alter table public.competition_settings
	add column css_points_per_property integer not null default 10
		check (css_points_per_property >= 1 and css_points_per_property <= 100000);
