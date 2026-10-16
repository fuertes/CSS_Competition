import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import {
	deleteCompetitionRound,
	listCompetitionRounds,
	startCompetitionRound,
} from '@/lib/data/competition';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { deleteRoundSchema, startRoundSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Lista las competiciones (ejecuciones/rondas) registradas, de más reciente a
 * más antigua, con un resumen de sus datos dependientes.
 */
export async function GET(): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	try {
		const rounds = await listCompetitionRounds(pool);
		return jsonResponse({ rounds });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudieron cargar las competiciones.',
			400,
		);
	}
}

/**
 * Inicia una ronda de competición para un ejercicio CSS. La ronda define el
 * ejercicio activo para todos los grupos; solo puede haber una abierta.
 */
export async function POST(request: NextRequest): Promise<Response> {
	const userId = await getRequestUserId();
	if (!userId) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = startRoundSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		const id = await startCompetitionRound(pool, parsed.data.exerciseId, userId);
		return jsonResponse({ id });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo iniciar la competición.',
			400,
		);
	}
}

/**
 * Elimina de verdad una competición (ejecución) con todos sus datos
 * dependientes, conservando grupos, códigos de acceso y el ejercicio. Solo
 * administradores; el identificador se valida en el servidor.
 */
export async function DELETE(request: NextRequest): Promise<Response> {
	const userId = await getRequestUserId();
	if (!userId) return errorResponse('No autorizado.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = deleteRoundSchema.safeParse({ id: request.nextUrl.searchParams.get('id') });
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		const result = await deleteCompetitionRound(pool, parsed.data.id, userId);
		return jsonResponse({ ok: true, result });
	} catch (error) {
		return errorResponse(
			error instanceof Error ? error.message : 'No se pudo eliminar la competición.',
			400,
		);
	}
}
