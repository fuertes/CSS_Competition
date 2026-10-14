import { getPool } from '@/lib/db';
import {
	getActiveCompetition,
	listCompetitionScores,
	listGroupScores,
	listSubmissions,
} from '@/lib/data/postgres';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Marcador por grupo e historial de resoluciones (auditable).
 *
 * Se distingue explícitamente:
 *   * `competitionScores`: marcador de la competición ACTIVA, aislado por ronda.
 *   * `groupScores`: marcador histórico acumulado (todas las competiciones).
 *   * `activeCompetition`: información de la competición abierta (si existe).
 */
export async function GET(): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	try {
		const [groupScores, submissions, competitionScores, activeCompetition] = await Promise.all([
			listGroupScores(pool),
			listSubmissions(pool),
			listCompetitionScores(pool),
			getActiveCompetition(pool),
		]);
		return jsonResponse({ groupScores, submissions, competitionScores, activeCompetition });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudieron cargar las puntuaciones.', 400);
	}
}
