import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { createCssExercise, listCssExercises } from '@/lib/data/competition';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { cssExerciseInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Lista los ejercicios CSS con su número de selectores y la ronda activa. */
export async function GET(): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	try {
		const exercises = await listCssExercises(pool);
		return jsonResponse({ exercises });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudieron cargar los ejercicios CSS.',
			400,
		);
	}
}

/** Crea un ejercicio CSS (sus selectores y reglas se añaden aparte). */
export async function POST(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = cssExerciseInputSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		const id = await createCssExercise(pool, parsed.data);
		return jsonResponse({ id });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo crear el ejercicio.',
			400,
		);
	}
}
