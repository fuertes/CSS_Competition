import type { NextRequest } from 'next/server';
import { studentPortalSchema } from '@/lib/validation';
import { getPool } from '@/lib/db';
import { callStudentPortal } from '@/lib/data/postgres';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Devuelve el grupo e historial del alumno a partir de su código de acceso. */
export async function POST(request: NextRequest): Promise<Response> {
	const pool = getPool();
	if (!pool) {
		return errorResponse('La aplicación no está configurada con PostgreSQL.', 503);
	}

	const parsed = studentPortalSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) {
		return errorResponse('Datos no válidos.', 422);
	}

	try {
		const portal = await callStudentPortal(pool, parsed.data.studentCode);
		return jsonResponse(portal);
	} catch (error) {
		console.error('[api/student/portal] Error al consultar el portal:', error);
		return errorResponse('No se pudo consultar el portal. Inténtalo de nuevo.', 502);
	}
}
