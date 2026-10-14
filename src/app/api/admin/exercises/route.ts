import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { createExercise, deleteExercise, listExercises, updateExercise } from '@/lib/data/postgres';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { exerciseInputSchema, exerciseUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Lista los ejercicios (los más recientes primero). */
export async function GET(): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);
	try {
		const exercises = await listExercises(pool);
		return jsonResponse({ exercises });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudieron cargar los ejercicios.', 400);
	}
}

/** Crea un ejercicio. El código secreto se asigna aparte. */
export async function POST(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = exerciseInputSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		const exercise = await createExercise(pool, parsed.data);
		return jsonResponse({ id: exercise.id });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo crear el ejercicio.', 400);
	}
}

/** Actualiza un ejercicio. */
export async function PUT(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const body = (await readJsonBody(request)) as { id?: string } | null;
	const id = typeof body?.id === 'string' ? body.id : '';
	const parsed = exerciseUpdateSchema.safeParse(body);
	if (!id || !parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		await updateExercise(pool, id, parsed.data);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo actualizar el ejercicio.', 400);
	}
}

/** Elimina un ejercicio. */
export async function DELETE(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const id = new URL(request.url).searchParams.get('id');
	if (!id) return errorResponse('Falta el identificador del ejercicio.', 422);

	try {
		await deleteExercise(pool, id);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo eliminar el ejercicio.', 400);
	}
}
