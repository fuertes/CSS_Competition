import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { createOcaGame, listOcaGames } from '@/lib/data/oca';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { createOcaGameSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Partidas de La Oca del Caos (panel docente). Solo accesible con sesión de
 * administrador, que el `proxy` ya exige para `/api/admin/*`; aquí se vuelve a
 * comprobar por defensa en profundidad. No expone datos de la competición CSS.
 */

/** Lista las partidas creadas con sus grupos participantes. */
export async function GET(): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	try {
		const games = await listOcaGames(pool);
		return jsonResponse({ games });
	} catch (error) {
		console.error('[api/admin/oca/games] No se pudieron cargar las partidas:', error);
		return errorResponse('No se pudieron cargar las partidas.', 502);
	}
}

/** Crea una partida en estado inicial con los grupos seleccionados. */
export async function POST(request: NextRequest): Promise<Response> {
	const actorId = await getRequestUserId();
	if (!actorId) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = createOcaGameSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		const game = await createOcaGame(pool, {
			name: parsed.data.name,
			groupIds: parsed.data.groupIds,
			createdBy: actorId,
		});
		return jsonResponse({ ok: true, game }, 201);
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo crear la partida.',
			400,
		);
	}
}
