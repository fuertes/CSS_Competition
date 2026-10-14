import { getPool } from '@/lib/db';
import { endCompetitionRound } from '@/lib/data/competition';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Cierra la ronda de competición abierta. */
export async function POST(): Promise<Response> {
	const userId = await getRequestUserId();
	if (!userId) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	try {
		const id = await endCompetitionRound(pool, userId);
		return jsonResponse({ id });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo cerrar la ronda.',
			400,
		);
	}
}
