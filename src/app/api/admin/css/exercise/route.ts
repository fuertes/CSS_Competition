import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { updateExercise } from '@/lib/data/postgres';
import { deleteCssExercise } from '@/lib/data/competition';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { exerciseUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Actualiza un ejercicio CSS (título, descripción, activo, archivado). */
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
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo actualizar el ejercicio.',
			400,
		);
	}
}

/** Elimina un ejercicio CSS. Falla si ya tiene puntuaciones (historial protegido). */
export async function DELETE(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const id = new URL(request.url).searchParams.get('id');
	if (!id) return errorResponse('Falta el identificador del ejercicio.', 422);

	try {
		await deleteCssExercise(pool, id);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo eliminar el ejercicio.',
			400,
		);
	}
}
