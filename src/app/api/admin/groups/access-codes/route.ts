import { getPool } from '@/lib/db';
import { listGroupAccessCodes } from '@/lib/data/competition';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Devuelve el código de acceso completo de cada grupo para el panel.
 *
 * Es información sensible: solo accesible con sesión de administrador. El
 * código se recupera del cifrado (AES-256-GCM); los grupos sin código o con un
 * código anterior a la recuperación devuelven `code: null` (nunca se inventa).
 * El hash y el lookups almacenados jamás se devuelven.
 */
export async function GET(): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	try {
		const codes = await listGroupAccessCodes(pool);
		return jsonResponse({ codes });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudieron cargar los códigos de acceso.',
			400,
		);
	}
}
