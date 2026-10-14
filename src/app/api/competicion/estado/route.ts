import { getPool } from '@/lib/db';
import { getCompetitionState } from '@/lib/data/competition';
import { getRequestGroupId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Estado público de la competición para el grupo autenticado: ejercicio de la
 * ronda activa, selector actual y clasificación. No incluye soluciones,
 * valores esperados ni secretos de sesión.
 */
export async function GET(): Promise<Response> {
	const groupId = await getRequestGroupId();
	if (!groupId) return errorResponse('Sesión de grupo no válida.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	try {
		const state = await getCompetitionState(pool, groupId);
		return jsonResponse(state);
	} catch (error) {
		console.error('[api/competicion/estado] No se pudo cargar el estado:', error);
		return errorResponse('No se pudo cargar el estado de la competición.', 502);
	}
}
