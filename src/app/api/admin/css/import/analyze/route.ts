import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { getSettings } from '@/lib/data/postgres';
import { analyzeCss, DEFAULT_IMPORT_LIMITS } from '@/lib/css/importer';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { cssImportAnalyzeSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Analiza (en el servidor, con PostCSS) un bloque CSS de referencia pegado por
 * el profesor y devuelve los selectores y declaraciones detectados.
 *
 * No guarda nada: la revisión y la confirmación son pasos separados. La
 * solución esperada solo se devuelve a la zona administrativa autenticada.
 */
export async function POST(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = cssImportAnalyzeSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Pega un bloque CSS válido para analizarlo.', 422);

	try {
		const result = analyzeCss(parsed.data.css, DEFAULT_IMPORT_LIMITS);
		const settings = await getSettings(pool);
		const basePoints = settings?.css_points_per_property ?? 10;
		return jsonResponse({ ...result, basePoints });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo analizar el CSS.',
			400,
		);
	}
}
