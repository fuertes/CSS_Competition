import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { setStudentAccessCode } from '@/lib/data/postgres';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { setStudentAccessCodeSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Asigna (o sustituye) el código de acceso personal de un alumno. */
export async function POST(request: NextRequest): Promise<Response> {
	const userId = await getRequestUserId();
	if (!userId) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = setStudentAccessCodeSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		await setStudentAccessCode(pool, parsed.data.studentId, parsed.data.code, userId);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo guardar el código.', 400);
	}
}
