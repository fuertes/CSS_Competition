import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { getPurgePreview, purgeEntities } from '@/lib/data/maintenance';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { purgeSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Vista previa del mantenimiento masivo. Devuelve los recuentos calculados en
 * la base de datos para poder mostrar el alcance real antes de confirmar.
 * Es una lectura: nunca elimina nada.
 */
export async function GET(): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	try {
		const preview = await getPurgePreview(pool);
		return jsonResponse({ preview });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo cargar el resumen de datos.',
			400,
		);
	}
}

/**
 * Ejecuta una purga masiva (grupos, alumnos o ambos). Solo administradores; el
 * ámbito y la frase de confirmación se validan en el servidor, y el borrado
 * real (con dependencias y auditoría) ocurre en la función SQL transaccional.
 */
export async function POST(request: NextRequest): Promise<Response> {
	const userId = await getRequestUserId();
	if (!userId) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = purgeSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) {
		return errorResponse('La confirmación no es válida. Escribe la frase exacta.', 422);
	}

	try {
		const result = await purgeEntities(pool, parsed.data.scope, parsed.data.confirmation, userId);
		return jsonResponse({ ok: true, result });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo completar la operación.',
			400,
		);
	}
}
