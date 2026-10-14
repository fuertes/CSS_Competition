-- =============================================================================
-- 0006 — Corrige la generación del código de acceso de grupo.
--
-- La versión inicial de `generate_group_access_code()` (migración 0005) usaba
-- `get_byte(gen_random_bytes(1))` con un solo argumento. En PostgreSQL la
-- función `get_byte` requiere el desplazamiento como segundo argumento
-- (`get_byte(bytea, integer)`), por lo que la llamada fallaba en tiempo de
-- ejecución y ningún grupo podía recibir un código de acceso.
--
-- Esta migración vuelve a crear la función con la firma correcta. Es idempotente
-- (CREATE OR REPLACE) y no modifica datos existentes.
-- =============================================================================

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
	-- 8 caracteres de un alfabeto de 32 símbolos (2^5) → 40 bits de entropía.
	-- `get_byte(..., 0) & 31` toma 5 bits sin sesgo de módulo. Sin caracteres
	-- ambiguos (I, O, 0, 1).
	for i in 1..8 loop
		v_code := v_code || substr(
			'ABCDEFGHKLMNPQRSTUVWXYZ23456789',
			(get_byte(gen_random_bytes(1), 0) & 31) + 1,
			1
		);
	end loop;
	return v_code;
end;
$$;
