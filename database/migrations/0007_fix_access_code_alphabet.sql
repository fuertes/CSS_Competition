-- =============================================================================
-- 0007 — Corrige el alfabeto de `generate_group_access_code()`.
--
-- Las migraciones 0005 y 0006 usaban el alfabeto
-- 'ABCDEFGHKLMNPQRSTUVWXYZ23456789', que tiene 31 caracteres (omite I, J y O),
-- mientras que el generador toma 5 bits (`& 31` → 0..31) e indexa de 1 a 32.
-- El índice 32 caía fuera del alfabeto y `substr(..., 32, 1)` devolvía cadena
-- vacía, de modo que algunos códigos salían con menos de 8 caracteres.
--
-- Se corrige el alfabeto a 32 símbolos (2^5) incluyendo la J: se siguen
-- omitiendo los caracteres ambiguos I, O, 0 y 1, y se mantiene la ausencia de
-- sesgo de módulo (potencia de dos).
--
-- Es idempotente (CREATE OR REPLACE) y no modifica datos existentes. Los
-- códigos ya emitidos siguen siendo válidos: tienen su lookup y su hash
-- almacenados; solo cambia cómo se generan los códigos nuevos.
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
			'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
			(get_byte(gen_random_bytes(1), 0) & 31) + 1,
			1
		);
	end loop;
	return v_code;
end;
$$;
