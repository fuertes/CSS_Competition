import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { deleteCssSelector, updateCssSelector } from '@/lib/data/competition';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { cssSelectorUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Actualiza el texto o la visibilidad de un selector. */
export async function PUT(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = cssSelectorUpdateSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		await updateCssSelector(pool, parsed.data.id, {
			selector: parsed.data.selector,
			active: parsed.data.active,
		});
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo actualizar el selector.',
			400,
		);
	}
}

/** Elimina un selector (y sus reglas). Falla si ya tiene puntuaciones. */
export async function DELETE(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const id = request.nextUrl.searchParams.get('id');
	if (!id) return errorResponse('Falta el identificador del selector.', 422);

	try {
		await deleteCssSelector(pool, id);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo eliminar el selector.',
			400,
		);
	}
}
