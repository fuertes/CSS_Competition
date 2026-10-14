-- =============================================================================
-- Migración 0004: código único y público por grupo (máximo 5 caracteres).
--
-- Cada grupo recibe un código corto, legible y único. No es secreto: se
-- muestra en el panel, pensado para que el profesor lo comparta e identifique
-- a los equipos. La unicidad se garantiza en la base de datos (UNIQUE) y la
-- generación es automática (trigger) tanto para grupos nuevos como para los
-- existentes en el momento de aplicar esta migración.
-- =============================================================================

-- 1) Columna nueva. Se añade nullable y se rellena antes de imponer NOT NULL.
alter table public.groups add column code text;

-- 2) Generador: 5 caracteres alfanuméricos sin ambiguos (0/O, 1/I/L) y con
--    comprobación de unicidad. `random()` no es criptográfico, pero la
--    unicidad la garantiza la restricción UNIQUE (y el reintento ante choques).
create or replace function public.generate_group_code()
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
	v_code text;
	v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
	v_attempts int := 0;
begin
	loop
		v_attempts := v_attempts + 1;
		v_code := '';
		for i in 1..5 loop
			v_code := v_code || substr(
				v_alphabet,
				1 + floor(random() * length(v_alphabet))::int,
				1
			);
		end loop;
		exit when v_attempts > 100
			or not exists (select 1 from public.groups where code = v_code);
	end loop;
	return v_code;
end;
$$;

-- 3) Relleno de los grupos existentes (migración de datos).
do $$
declare
	v_row record;
begin
	for v_row in
		select id from public.groups
		where code is null or length(trim(code)) = 0
	loop
		update public.groups
		set code = public.generate_group_code()
		where id = v_row.id;
	end loop;
end;
$$;

-- 4) Restricciones: obligatorio, de 1 a 5 caracteres y único.
alter table public.groups
	alter column code set not null,
	add constraint groups_code_length check (length(code) between 1 and 5),
	add constraint groups_code_unique unique (code);

-- 5) Asignación automática en inserciones futuras.
create or replace function public.groups_assign_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
	if new.code is null or length(trim(new.code)) = 0 then
		-- Serializa la generación entre inserciones simultáneas para reducir
		-- choques; la restricción grups_code_unique sigue siendo la garantía
		-- definitiva (el servidor reintenta si detecta un choque residual).
		perform pg_advisory_xact_lock(2718281829);
		loop
			new.code := public.generate_group_code();
			exit when not exists (select 1 from public.groups where code = new.code);
		end loop;
	end if;
	return new;
end;
$$;

drop trigger if exists groups_assign_code on public.groups;
create trigger groups_assign_code
	before insert on public.groups
	for each row execute function public.groups_assign_code();