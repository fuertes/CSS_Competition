import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { saveCssImport } from '@/lib/data/competition';
import { validateImportPayload, DEFAULT_IMPORT_LIMITS } from '@/lib/css/importer';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { cssImportSaveSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Guarda un ejercicio CSS a partir del CSS de referencia revisado por el
 * profesor.
 *
 * El cuerpo lo construye el navegador (no confiable): se revalida cada selector
 * y se recalcula el valor canónico de cada declaración en el servidor antes de
 * escribir. Todo se ejecuta en una única transacción PostgreSQL.
 */
export async function POST(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = cssImportSaveSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos del ejercicio.', 422);

	const validated = validateImportPayload(
		parsed.data.selectors,
		parsed.data.basePoints,
		DEFAULT_IMPORT_LIMITS,
	);
	if (!validated.ok) return errorResponse(validated.message, 422);

	try {
		const summary = await saveCssImport(pool, {
			exerciseId: parsed.data.exerciseId,
			title: parsed.data.title,
			description: parsed.data.description,
			selectors: validated.selectors,
		});
		return jsonResponse({ ok: true, summary });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo guardar la importación.',
			400,
		);
	}
}
