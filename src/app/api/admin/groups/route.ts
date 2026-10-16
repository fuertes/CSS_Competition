import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { createGroup, deleteGroup, listGroups, updateGroup } from '@/lib/data/postgres';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { groupInputSchema, groupUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Lista los grupos (orden alfabético). */
export async function GET(): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);
	try {
		const groups = await listGroups(pool);
		return jsonResponse({ groups });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudieron cargar los grupos.', 400);
	}
}

/** Crea un grupo. */
export async function POST(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = groupInputSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		await createGroup(pool, parsed.data);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo crear el grupo.', 400);
	}
}

/** Actualiza un grupo. */
export async function PUT(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const body = (await readJsonBody(request)) as { id?: string } | null;
	const id = typeof body?.id === 'string' ? body.id : '';
	const parsed = groupUpdateSchema.safeParse(body);
	if (!id || !parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		await updateGroup(pool, id, parsed.data);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo actualizar el grupo.', 400);
	}
}

/** Elimina un grupo. */
export async function DELETE(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const id = request.nextUrl.searchParams.get('id');
	if (!id) return errorResponse('Falta el identificador del grupo.', 422);

	try {
		await deleteGroup(pool, id);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo eliminar el grupo.', 400);
	}
}
