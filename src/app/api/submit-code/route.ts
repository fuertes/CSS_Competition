import type { NextRequest } from 'next/server';
import { submitCodeSchema } from '@/lib/validation';
import { getPool } from '@/lib/db';
import { callSubmitExerciseCode } from '@/lib/data/postgres';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Valida un código de ejercicio y otorga puntos de forma atómica en el
 * servidor (función `submit_exercise_code` de PostgreSQL). El cliente no
 * decide el grupo beneficiario ni la cantidad de puntos.
 */
export async function POST(request: NextRequest): Promise<Response> {
	const pool = getPool();
	if (!pool) {
		return errorResponse('La aplicación no está configurada con PostgreSQL.', 503);
	}

	const parsed = submitCodeSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) {
		return errorResponse('Revisa los datos introducidos.', 422);
	}

	try {
		const result = await callSubmitExerciseCode(
			pool,
			parsed.data.studentCode,
			parsed.data.exerciseCode,
		);
		return jsonResponse(result);
	} catch (error) {
		console.error('[api/submit-code] Error al validar el código:', error);
		return errorResponse('No se pudo procesar el envío. Inténtalo de nuevo.', 502);
	}
}
