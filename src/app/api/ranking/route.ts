import type { RankingRow } from '@/types';
import { getPool } from '@/lib/db';
import { fetchRankingRows } from '@/lib/data/postgres';
import { errorResponse, jsonResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Clasificación pública desde la vista `ranking` de PostgreSQL.
 * Este es el origen del "tiempo real": el cliente consulta este endpoint
 * periódicamente (y podrá suscribirse a SSE/WebSocket en el futuro sin tocar
 * el resto de la aplicación).
 */
export async function GET(): Promise<Response> {
	const pool = getPool();
	if (!pool) {
		return errorResponse('La aplicación no está configurada con PostgreSQL.', 503);
	}

	try {
		const rows = await fetchRankingRows(pool);
		return jsonResponse({ entries: rows as RankingRow[] });
	} catch (error) {
		console.error('[api/ranking] No se pudo leer el ranking:', error);
		return errorResponse('No se pudo cargar la clasificación.', 502);
	}
}
