import 'server-only';
import type { Pool } from 'pg';
import { run, toIso, withTransaction } from '@/lib/data/postgres';
import { OCA_INITIAL_POSITION } from '@/lib/oca/board';
import { normalizeOcaGroupIds } from '@/lib/oca/participants';
import type { OcaGameForGroup, OcaGameParticipant, OcaGameRow, OcaGameStatus } from '@/types';

/**
 * Acceso a datos de La Oca del Caos (solo servidor).
 *
 * Fase 2: persistencia de partidas en estado inicial y de sus grupos
 * participantes. Fase 3: posición persistente de cada participante en el
 * tablero de 40 casillas (solo lectura; sin movimiento).
 *
 * Este módulo escribe EXCLUSIVAMENTE en `oca_games` y `oca_game_participants`;
 * nunca toca las tablas de la competición CSS ni la puntuación del ranking. El
 * grupo se recibe siempre como parámetro (procedente de la sesión verificada
 * por el servidor), nunca del cuerpo de la petición, y la posición de un grupo
 * procede del servidor, no del cliente.
 */

interface OcaGameDbRow {
	id: string;
	name: string;
	status: OcaGameStatus;
	created_by: string | null;
	created_at: Date;
	updated_at: Date;
}

interface OcaGameForGroupDbRow {
	id: string;
	name: string;
	status: OcaGameStatus;
	created_at: Date;
}

interface OcaParticipantDbRow {
	game_id: string;
	id: string;
	name: string;
	color: string;
	position: number;
	joined_at: Date;
}

/** Participantes de una partida, con los datos públicos del grupo. */
const SELECT_PARTICIPANTS_SQL = `select p.game_id, g.id, g.name, g.color, p.position, p.joined_at
	from public.oca_game_participants p
	join public.groups g on g.id = p.group_id
	where p.game_id = any($1::uuid[])
	order by g.name asc`;

function mapParticipant(row: OcaParticipantDbRow): OcaGameParticipant {
	return {
		id: row.id,
		name: row.name,
		color: row.color,
		position: row.position,
		joined_at: toIso(row.joined_at) ?? '',
	};
}

/** Agrupa las filas de participantes (con `game_id`) por partida. */
function groupParticipants(rows: OcaParticipantDbRow[]): Map<string, OcaGameParticipant[]> {
	const byGame = new Map<string, OcaGameParticipant[]>();
	for (const row of rows) {
		const participant = mapParticipant(row);
		const list = byGame.get(row.game_id);
		if (list) list.push(participant);
		else byGame.set(row.game_id, [participant]);
	}
	return byGame;
}

/** Partidas creadas, de la más reciente a la más antigua (panel docente). */
export async function listOcaGames(pool: Pool): Promise<OcaGameRow[]> {
	return run(async () => {
		const { rows } = await pool.query<OcaGameDbRow>(
			`select id, name, status, created_by, created_at, updated_at
			 from public.oca_games
			 order by created_at desc, id desc`,
		);
		if (rows.length === 0) return [];

		const { rows: participantRows } = await pool.query<OcaParticipantDbRow>(
			SELECT_PARTICIPANTS_SQL,
			[rows.map((row) => row.id)],
		);
		const byGame = groupParticipants(participantRows);

		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			status: row.status,
			created_by: row.created_by,
			created_at: toIso(row.created_at) ?? '',
			updated_at: toIso(row.updated_at) ?? '',
			participants: byGame.get(row.id) ?? [],
		}));
	});
}

/**
 * Partidas en las que participa UN grupo concreto (vista de solo lectura del
 * grupo). El filtro `p.group_id = $1` vive en la consulta: un grupo solo puede
 * obtener las partidas a las que está asociado, y el identificador procede de
 * la sesión verificada por el servidor.
 */
export async function listOcaGamesForGroup(
	pool: Pool,
	groupId: string,
): Promise<OcaGameForGroup[]> {
	return run(async () => {
		const { rows } = await pool.query<OcaGameForGroupDbRow>(
			`select gm.id, gm.name, gm.status, gm.created_at
			 from public.oca_games gm
			 join public.oca_game_participants p on p.game_id = gm.id
			 where p.group_id = $1
			 order by gm.created_at desc, gm.id desc`,
			[groupId],
		);
		if (rows.length === 0) return [];

		const { rows: participantRows } = await pool.query<OcaParticipantDbRow>(
			SELECT_PARTICIPANTS_SQL,
			[rows.map((row) => row.id)],
		);
		const byGame = groupParticipants(participantRows);

		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			status: row.status,
			created_at: toIso(row.created_at) ?? '',
			participants: byGame.get(row.id) ?? [],
		}));
	});
}

export interface CreateOcaGameData {
	name: string;
	/** Identificadores de grupo enviados por el cliente (se normalizan y validan). */
	groupIds: string[];
	/** Docente que crea la partida (de la sesión verificada). */
	createdBy: string | null;
}

/**
 * Crea una partida con sus grupos participantes de forma ATÓMICA.
 *
 * 1. Normaliza y deduplica los identificadores.
 * 2. Comprueba en el servidor que TODOS los grupos existen y están activos.
 * 3. Inserta la partida y sus participantes dentro de una única transacción:
 *    si algo falla, no queda una partida a medias.
 *
 * Todas las posiciones se inicializan en la casilla 1 (`OCA_INITIAL_POSITION`).
 * El cliente NUNCA elige la posición: procede de esta constante del tablero.
 */
export async function createOcaGame(pool: Pool, input: CreateOcaGameData): Promise<OcaGameRow> {
	const groupIds = normalizeOcaGroupIds(input.groupIds);
	if (groupIds.length === 0) {
		throw new Error('Selecciona al menos un grupo.');
	}

	return withTransaction(pool, async (client) => {
		const { rows: validGroups } = await client.query<{ id: string }>(
			`select id from public.groups where id = any($1::uuid[]) and active`,
			[groupIds],
		);
		if (validGroups.length !== groupIds.length) {
			throw new Error('Algún grupo seleccionado no existe o no está activo.');
		}

		const { rows } = await client.query<OcaGameDbRow>(
			`insert into public.oca_games (name, created_by)
			 values ($1, $2)
			 returning id, name, status, created_by, created_at, updated_at`,
			[input.name, input.createdBy],
		);
		const game = rows[0]!;

		await client.query(
			`insert into public.oca_game_participants (game_id, group_id, position)
			 select $1::uuid, g.id, $3::int from unnest($2::uuid[]) as g(id)`,
			[game.id, groupIds, OCA_INITIAL_POSITION],
		);

		const { rows: participantRows } = await client.query<OcaParticipantDbRow>(
			SELECT_PARTICIPANTS_SQL,
			[[game.id]],
		);
		const participants = groupParticipants(participantRows).get(game.id) ?? [];

		return {
			id: game.id,
			name: game.name,
			status: game.status,
			created_by: game.created_by,
			created_at: toIso(game.created_at) ?? '',
			updated_at: toIso(game.updated_at) ?? '',
			participants,
		};
	});
}
