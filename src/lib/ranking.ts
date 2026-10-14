import type { RankingEntry } from '@/types';

export interface RankingInput {
	groupId: string;
	name: string;
	color: string;
	active: boolean;
	totalPoints: number;
	solvedCount: number;
	lastScoredAt: string | null;
}

/**
 * Comparador del ranking.
 *
 * Criterios, en orden:
 *  1. Mayor puntuación total primero.
 *  2. A igual puntuación, quien alcanzó esa puntuación antes (lastScoredAt
 *     más antiguo) va primero. Esto premia llegar antes al marcador actual.
 *  3. Los grupos que nunca han puntuado (lastScoredAt nulo) quedan después.
 *  4. Nombre alfabético como último criterio para un orden estable y visible.
 */
export function compareRanking(a: RankingInput, b: RankingInput): number {
	if (b.totalPoints !== a.totalPoints) {
		return b.totalPoints - a.totalPoints;
	}

	const aTime = a.lastScoredAt ? Date.parse(a.lastScoredAt) : Number.POSITIVE_INFINITY;
	const bTime = b.lastScoredAt ? Date.parse(b.lastScoredAt) : Number.POSITIVE_INFINITY;
	if (aTime !== bTime) {
		return aTime - bTime;
	}

	return a.name.localeCompare(b.name, 'es');
}

/**
 * Dos entradas están realmente empatadas si tienen la misma puntuación y no
 * existe información temporal que las separe.
 */
export function isTied(a: RankingInput, b: RankingInput): boolean {
	return a.totalPoints === b.totalPoints && (a.lastScoredAt ?? null) === (b.lastScoredAt ?? null);
}

/**
 * Ordena las entradas y calcula la posición 1-based, compartiendo posición en
 * caso de empate real.
 */
export function rankEntries(entries: RankingInput[]): RankingEntry[] {
	const sorted = [...entries].sort(compareRanking);
	let position = 0;
	let previous: RankingInput | null = null;

	return sorted.map((entry, index) => {
		if (!previous || !isTied(previous, entry)) {
			position = index + 1;
		}
		previous = entry;
		return { ...entry, position };
	});
}

/** Devuelve las entradas empatadas en la misma posición que la indicada. */
export function tiedGroup(entries: RankingEntry[], entry: RankingEntry): RankingEntry[] {
	return entries.filter(
		(candidate) =>
			candidate.position === entry.position && candidate.totalPoints === entry.totalPoints,
	);
}
