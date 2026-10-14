import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { clearAssignment, confirmAssignment, correctAssignment } from '@/lib/data/postgres';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { assignmentActionSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Asignaciones: confirma, desasigna o corrige de forma excepcional.
 * Las reglas de negocio (bloqueo, unicidad, auditoría) se aplican en las
 * funciones privilegiadas de PostgreSQL, con el actor de la sesión autenticada.
 */
export async function POST(request: NextRequest): Promise<Response> {
	const userId = await getRequestUserId();
	if (!userId) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = assignmentActionSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		switch (parsed.data.action) {
			case 'confirm':
				await confirmAssignment(pool, parsed.data.studentId, parsed.data.groupId, userId);
				break;
			case 'clear':
				await clearAssignment(pool, parsed.data.studentId, userId);
				break;
			case 'correct':
				await correctAssignment(
					pool,
					parsed.data.studentId,
					parsed.data.groupId,
					parsed.data.reason,
					userId,
				);
				break;
		}
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo aplicar la asignación.', 400);
	}
}
