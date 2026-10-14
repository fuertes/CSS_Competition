import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { getSettings, updateSettings } from '@/lib/data/postgres';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { settingsUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Devuelve la configuración de la competición. */
export async function GET(): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);
	try {
		const settings = await getSettings(pool);
		return jsonResponse({ settings });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo leer la configuración.', 400);
	}
}

/** Actualiza la configuración. */
export async function PUT(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = settingsUpdateSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		await updateSettings(pool, parsed.data);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo guardar la configuración.', 400);
	}
}
