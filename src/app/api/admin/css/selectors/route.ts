import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { createCssSelector, listCssSelectors } from '@/lib/data/competition';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { cssSelectorInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Lista los selectores de un ejercicio con sus reglas privadas. */
export async function GET(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const exerciseId = new URL(request.url).searchParams.get('exerciseId');
	if (!exerciseId) return errorResponse('Falta el identificador del ejercicio.', 422);

	try {
		const selectors = await listCssSelectors(pool, exerciseId);
		return jsonResponse({ selectors });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudieron cargar los selectores.',
			400,
		);
	}
}

/** Añade un selector al ejercicio (al final, por posición). */
export async function POST(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = cssSelectorInputSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		const selector = await createCssSelector(pool, parsed.data);
		return jsonResponse({ selector });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo añadir el selector.',
			400,
		);
	}
}
