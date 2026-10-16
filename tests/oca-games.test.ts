import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { createOcaGame, listOcaGamesForGroup } from '@/lib/data/oca';
import { normalizeOcaGroupIds } from '@/lib/oca/participants';

/**
 * Pruebas de la capa de datos de La Oca con un `Pool` SIMULADO.
 *
 * No se conecta a ninguna base de datos real: se comprueba la lógica que
 * garantiza las reglas de negocio (validación de grupos, deduplicación,
 * atomicidad y aislamiento por grupo) observando el SQL y los parámetros que el
 * código emite.
 */

const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';
const G3 = '33333333-3333-4333-8333-333333333333';
const GAME_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

interface QueryCall {
	text: string;
	values: unknown[];
}

const lower = (call: QueryCall) => call.text.toLowerCase();

function toArray(value: unknown): string[] {
	if (Array.isArray(value)) return value as string[];
	if (value === undefined || value === null) return [];
	return [value as string];
}

function participantRow(gameId: string, groupId: string, name: string) {
	return {
		game_id: gameId,
		id: groupId,
		name,
		color: '#6366f1',
		joined_at: new Date('2026-01-01T00:00:00.000Z'),
	};
}

/** Respuestas por defecto para un flujo correcto completo. */
function standardRespond(call: QueryCall): { rows: unknown[] } {
	const text = lower(call);

	if (text === 'begin' || text === 'commit' || text === 'rollback') return { rows: [] };

	if (text.includes('from public.groups where id = any')) {
		return { rows: toArray(call.values[0]).map((id) => ({ id })) };
	}

	if (text.includes('insert into public.oca_games')) {
		return {
			rows: [
				{
					id: GAME_ID,
					name: call.values[0],
					status: 'created',
					created_by: call.values[1] ?? null,
					created_at: new Date('2026-01-01T00:00:00.000Z'),
					updated_at: new Date('2026-01-01T00:00:00.000Z'),
				},
			],
		};
	}

	if (text.includes('insert into public.oca_game_participants')) {
		return { rows: [] };
	}

	if (text.includes('from public.oca_game_participants p') && text.includes('join public.groups g')) {
		const rows = toArray(call.values[0]).flatMap((gameId) => [
			participantRow(gameId, G1, 'Alfa'),
			participantRow(gameId, G2, 'Beta'),
		]);
		return { rows };
	}

	return { rows: [] };
}

function createFakePool(respond: (call: QueryCall) => { rows: unknown[] }) {
	const calls: QueryCall[] = [];
	let releaseCount = 0;

	const record = (text: string, values: unknown[] = []) => {
		const call = { text, values };
		calls.push(call);
		return respond(call);
	};

	const client = {
		query: async (text: string, values: unknown[] = []) => record(text, values),
		release: () => {
			releaseCount += 1;
		},
	};

	const pool = {
		query: async (text: string, values: unknown[] = []) => record(text, values),
		connect: async () => client,
	};

	return { pool: pool as unknown as Pool, calls, releases: () => releaseCount };
}

describe('normalizeOcaGroupIds', () => {
	it('elimina duplicados conservando el orden de aparición', () => {
		expect(normalizeOcaGroupIds([G1, G2, G1, G3, G2])).toEqual([G1, G2, G3]);
	});

	it('deduplica sin distinguir mayúsculas ni espacios', () => {
		expect(normalizeOcaGroupIds([G1.toUpperCase(), `  ${G1}  `])).toEqual([G1]);
	});

	it('descarta cadenas vacías', () => {
		expect(normalizeOcaGroupIds(['', '   ', G1])).toEqual([G1]);
	});
});

describe('createOcaGame', () => {
	it('crea la partida y sus participantes dentro de una transacción', async () => {
		const fake = createFakePool(standardRespond);

		const game = await createOcaGame(fake.pool, {
			name: 'Jornada 1',
			groupIds: [G1, G2],
			createdBy: 'admin-1',
		});

		expect(game.id).toBe(GAME_ID);
		expect(game.name).toBe('Jornada 1');
		expect(game.status).toBe('created');
		expect(game.participants).toHaveLength(2);

		const sql = fake.calls.map((call) => call.text.toLowerCase());
		expect(sql[0]).toBe('begin');
		expect(sql).toContain('commit');
		expect(sql).not.toContain('rollback');
	});

	it('no asocia dos veces el mismo grupo', async () => {
		const fake = createFakePool(standardRespond);

		await createOcaGame(fake.pool, { name: 'X', groupIds: [G1, G1, G2], createdBy: null });

		const groupsCheck = fake.calls.find((call) =>
			lower(call).includes('from public.groups where id = any'),
		);
		expect(groupsCheck?.values[0]).toEqual([G1, G2]);

		const insert = fake.calls.find((call) =>
			lower(call).includes('insert into public.oca_game_participants'),
		);
		expect(insert?.values[1]).toEqual([G1, G2]);
	});

	it('rechaza grupos inexistentes o inactivos sin confirmar la transacción', async () => {
		const fake = createFakePool((call) => {
			if (lower(call).includes('from public.groups where id = any')) {
				// Solo uno de los dos grupos existe/está activo.
				return { rows: [{ id: G1 }] };
			}
			return standardRespond(call);
		});

		await expect(
			createOcaGame(fake.pool, { name: 'X', groupIds: [G1, G2], createdBy: null }),
		).rejects.toThrow(/no existe o no está activo/i);

		const sql = fake.calls.map((call) => call.text.toLowerCase());
		expect(sql).toContain('rollback');
		expect(sql).not.toContain('commit');
		expect(fake.calls.some((call) => lower(call).includes('insert into public.oca_games'))).toBe(
			false,
		);
	});

	it('revierte la transacción si falla la inserción de participantes', async () => {
		const fake = createFakePool((call) => {
			if (lower(call).includes('insert into public.oca_game_participants')) {
				throw new Error('fallo simulado de base de datos');
			}
			return standardRespond(call);
		});

		await expect(
			createOcaGame(fake.pool, { name: 'X', groupIds: [G1], createdBy: null }),
		).rejects.toThrow('fallo simulado de base de datos');

		const sql = fake.calls.map((call) => call.text.toLowerCase());
		expect(sql).toContain('begin');
		expect(sql).toContain('rollback');
		expect(sql).not.toContain('commit');
	});

	it('rechaza una partida sin grupos sin tocar la base de datos', async () => {
		const fake = createFakePool(standardRespond);

		await expect(
			createOcaGame(fake.pool, { name: 'X', groupIds: [], createdBy: null }),
		).rejects.toThrow(/al menos un grupo/i);

		expect(fake.calls).toHaveLength(0);
	});
});

describe('listOcaGamesForGroup — aislamiento por grupo', () => {
	it('consulta solo las partidas del grupo recibido y lo pasa como parámetro', async () => {
		const fake = createFakePool((call) => {
			if (lower(call).includes('from public.oca_games gm')) {
				return {
					rows: [
						{
							id: GAME_ID,
							name: 'Jornada 1',
							status: 'created',
							created_at: new Date('2026-01-01T00:00:00.000Z'),
						},
					],
				};
			}
			return standardRespond(call);
		});

		const games = await listOcaGamesForGroup(fake.pool, G1);

		expect(games).toHaveLength(1);
		expect(games[0]?.name).toBe('Jornada 1');

		const query = fake.calls.find((call) => lower(call).includes('from public.oca_games gm'));
		expect(query?.values).toEqual([G1]);
		expect(lower(query!)).toContain('where p.group_id = $1');
	});
});
