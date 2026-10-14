import { getPool } from '@/lib/db';
import { getRanking } from '@/lib/data/competition';
import { getRequestGroupId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Clasificación agregada de la competición (requiere sesión de grupo). */
export async function GET(): Promise<Response> {
	const groupId = await getRequestGroupId();
	if (!groupId) return errorResponse('Sesión de grupo no válida.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	try {
		const entries = await getRanking(pool);
		return jsonResponse({ entries });
	} catch (error) {
		console.error('[api/competicion/clasificacion] No se pudo cargar la clasificación:', error);
		return errorResponse('No se pudo cargar la clasificación.', 502);
	}
}
