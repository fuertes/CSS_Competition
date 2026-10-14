import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { createCssRule } from '@/lib/data/competition';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { cssRuleInputSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Añade una regla privada (solución) a un selector: propiedad, valor esperado
 * y puntos. El valor esperado se guarda en forma canónica para compararlo con
 * las entregas sin convertir valores distintos en equivalentes.
 */
export async function POST(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = cssRuleInputSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		const rule = await createCssRule(pool, parsed.data);
		return jsonResponse({ rule });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo añadir la regla.',
			400,
		);
	}
}
