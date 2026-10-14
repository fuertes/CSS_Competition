import type { RankingRow } from '@/types';
import type { RankingInput } from '@/lib/ranking';

/**
 * Convierte las filas de la vista `ranking` en entradas del dominio.
 * Acepta también valores ya serializados (ISO) desde la API.
 */
export function toRankingInputs(rows: RankingRow[]): RankingInput[] {
	return rows.map((row) => ({
		groupId: row.group_id,
		name: row.name,
		color: row.color,
		active: row.active ?? true,
		totalPoints: row.total_points ?? 0,
		solvedCount: row.solved_count ?? 0,
		lastScoredAt: row.last_scored_at,
	}));
}

/**
 * Recupera el ranking desde el endpoint público `/api/ranking`.
 *
 * Este módulo solo toca el navegador: el polen de datos se resuelve en el
 * servidor (vista `ranking` en PostgreSQL), nunca aquí.
 */
export async function fetchRanking(): Promise<RankingInput[]> {
	const response = await fetch('/api/ranking', {
		headers: { accept: 'application/json' },
		// Evita cachear resultados antiguos entre sondeos.
		cache: 'no-store',
	});
	if (!response.ok) {
		throw new Error('No se pudo cargar la clasificación.');
	}
	const body = (await response.json()) as { entries: RankingRow[] };
	return toRankingInputs(body.entries ?? []);
}