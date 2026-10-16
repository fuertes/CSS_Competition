import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { deleteCssRule, updateCssRule } from '@/lib/data/competition';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { cssRuleUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Actualiza una regla privada de un selector. */
export async function PUT(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = cssRuleUpdateSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		await updateCssRule(pool, parsed.data.id, {
			property: parsed.data.property,
			expectedValue: parsed.data.expectedValue,
			points: parsed.data.points,
		});
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo actualizar la regla.',
			400,
		);
	}
}

/**
 * Elimina una regla privada. Los puntos ya concedidos se conservan: el
 * historial (group_property_scores/scoring_events) referencia la propiedad, no
 * la regla, de modo que la puntuación registrada no se altera.
 */
export async function DELETE(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const id = request.nextUrl.searchParams.get('id');
	if (!id) return errorResponse('Falta el identificador de la regla.', 422);

	try {
		await deleteCssRule(pool, id);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo eliminar la regla.',
			400,
		);
	}
}
