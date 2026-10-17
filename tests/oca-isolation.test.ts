import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Separación entre La Oca del Caos y CSS Competition.
 *
 * Estas pruebas leen el código fuente (migración y capa de datos) y fijan dos
 * invariantes: la migración de La Oca es puramente aditiva (solo crea tablas
 * propias, sin alterar ni borrar nada existente) y ni la migración ni la capa de
 * datos tocan las tablas de puntuación de la competición CSS.
 */

const root = process.cwd();
const migration = readFileSync(join(root, 'database/migrations/0015_oca_games.sql'), 'utf8');
const positionsMigration = readFileSync(
	join(root, 'database/migrations/0016_oca_positions.sql'),
	'utf8',
);
const ocaData = readFileSync(join(root, 'src/lib/data/oca.ts'), 'utf8');

const CSS_TABLES = [
	'group_scores',
	'scoring_events',
	'submissions',
	'competition_rounds',
	'competition_settings',
	'competition_participants',
	'selector_rules',
	'group_property_scores',
	'group_attempts',
	'css_submission_requests',
];

describe('migración 0015 — aislamiento y aditividad', () => {
	it('crea únicamente las tablas propias de La Oca', () => {
		expect(migration).toContain('create table public.oca_games');
		expect(migration).toContain('create table public.oca_game_participants');
	});

	it('no referencia ninguna tabla de la competición CSS', () => {
		for (const table of CSS_TABLES) {
			expect(migration.toLowerCase()).not.toContain(table);
		}
	});

	it('es aditiva: no altera ni elimina objetos existentes', () => {
		const text = migration.toLowerCase();
		expect(text).not.toContain('alter table');
		expect(text).not.toContain('drop table');
		expect(text).not.toContain('drop function');
		expect(text).not.toContain('drop view');
	});

	it('una participación se elimina en cascada con su grupo y su partida', () => {
		const text = migration.toLowerCase();
		expect(text).toContain('references public.oca_games (id) on delete cascade');
		expect(text).toContain('references public.groups (id) on delete cascade');
	});

	it('impide asociar dos veces el mismo grupo a la misma partida', () => {
		expect(migration.toLowerCase()).toContain('primary key (game_id, group_id)');
	});
});

describe('migración 0016 — posiciones persistentes', () => {
	it('amplía la participación con la columna de posición (mínimo cambio)', () => {
		const text = positionsMigration.toLowerCase();
		expect(text).toContain('alter table public.oca_game_participants');
		expect(text).toContain('add column position integer not null default 1');
		expect(text).toContain('check (position between 1 and 40)');
	});

	it('solo altera la tabla de participación de La Oca (nada más)', () => {
		const altered = positionsMigration.match(/alter\s+table\s+public\.[a-z_]+/gi) ?? [];
		expect(altered.length).toBeGreaterThan(0);
		for (const statement of altered) {
			expect(statement.toLowerCase()).toBe('alter table public.oca_game_participants');
		}
	});

	it('es aditiva: no crea tablas ni elimina objetos existentes', () => {
		const text = positionsMigration.toLowerCase();
		expect(text).not.toContain('create table');
		expect(text).not.toContain('drop table');
		expect(text).not.toContain('drop function');
		expect(text).not.toContain('drop view');
	});

	it('no referencia ninguna tabla de la competición CSS', () => {
		for (const table of CSS_TABLES) {
			expect(positionsMigration.toLowerCase()).not.toContain(table);
		}
	});
});

describe('capa de datos de La Oca — separación respecto a CSS', () => {
	it('no escribe ni lee tablas de puntuación de la competición', () => {
		for (const table of CSS_TABLES) {
			expect(ocaData.toLowerCase()).not.toContain(table);
		}
	});

	it('solo escribe en las tablas oca_*', () => {
		const inserts = ocaData.match(/insert\s+into\s+public\.[a-z_]+/gi) ?? [];
		expect(inserts.length).toBeGreaterThan(0);
		for (const insert of inserts) {
			expect(insert.toLowerCase()).toContain('public.oca_');
		}
	});
});
