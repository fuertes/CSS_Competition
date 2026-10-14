import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { generateGroupAccessCode } from '@/lib/data/competition';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { generateGroupAccessCodeSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Genera (o regenera) el código de acceso de un grupo. El código en claro se
 * devuelve una única vez para que el profesor lo entregue al grupo; en la base
 * de datos solo se guarda su hash. Regenerarlo invalida las sesiones activas.
 */
export async function POST(request: NextRequest): Promise<Response> {
	const userId = await getRequestUserId();
	if (!userId) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = generateGroupAccessCodeSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		const code = await generateGroupAccessCode(pool, parsed.data.groupId, userId);
		return jsonResponse({ code });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo generar el código.',
			400,
		);
	}
}
