import { describe, it, expect } from 'vitest';
import {
	compareRanking,
	isTied,
	rankEntries,
	tiedGroup,
	type RankingInput,
} from '@/lib/ranking';

function entry(overrides: Partial<RankingInput> = {}): RankingInput {
	return {
		groupId: 'group-1',
		name: 'Grupo A',
		color: '#2563eb',
		active: true,
		totalPoints: 0,
		solvedCount: 0,
		lastScoredAt: null,
		...overrides,
	};
}

describe('compareRanking', () => {
	it('ordena primero la mayor puntuación', () => {
		const a = entry({ totalPoints: 100 });
		const b = entry({ totalPoints: 300 });
		expect(compareRanking(a, b)).toBeGreaterThan(0);
		expect(compareRanking(b, a)).toBeLessThan(0);
		expect([a, b].sort(compareRanking).map((e) => e.totalPoints)).toEqual([300, 100]);
	});

	it('con la misma puntuación, premia quien llegó antes (lastScoredAt más antiguo)', () => {
		const earlier = entry({ totalPoints: 200, lastScoredAt: '2026-01-01T10:00:00Z' });
		const later = entry({ totalPoints: 200, lastScoredAt: '2026-01-01T12:00:00Z' });
		expect(compareRanking(earlier, later)).toBeLessThan(0);
	});

	it('los grupos sin puntuación quedan después de los que sí puntuaron', () => {
		const scored = entry({ totalPoints: 100, lastScoredAt: '2026-01-01T10:00:00Z' });
		const unscored = entry({ totalPoints: 100, lastScoredAt: null });
		expect(compareRanking(scored, unscored)).toBeLessThan(0);
	});

	it('como último criterio ordena por nombre alfabético', () => {
		const a = entry({ name: 'Alpha' });
		const a2 = entry({ name: 'Beta', groupId: 'group-2' });
		expect(compareRanking(a, a2)).toBeLessThan(0);
		expect(compareRanking(a2, a)).toBeGreaterThan(0);
	});
});

describe('isTied', () => {
	it('considera empatados dos grupos con la misma puntuación y el mismo instante', () => {
		const a = entry({ totalPoints: 300, lastScoredAt: '2026-01-01T10:00:00Z' });
		const b = entry({ totalPoints: 300, lastScoredAt: '2026-01-01T10:00:00Z' });
		expect(isTied(a, b)).toBe(true);
	});

	it('considera empatados dos grupos sin puntuar', () => {
		expect(isTied(entry({ totalPoints: 0 }), entry({ totalPoints: 0 }))).toBe(true);
	});

	it('no considera empatados grupos con distinta puntuación o distinto instante', () => {
		expect(isTied(entry({ totalPoints: 100 }), entry({ totalPoints: 200 }))).toBe(false);
		expect(
			isTied(
				entry({ totalPoints: 200, lastScoredAt: '2026-01-01T10:00:00Z' }),
				entry({ totalPoints: 200, lastScoredAt: '2026-01-01T12:00:00Z' }),
			),
		).toBe(false);
	});
});

describe('rankEntries', () => {
	it('ordena de mayor a menor puntuación y asigna posiciones 1-based', () => {
		const entries = rankEntries([
			entry({ groupId: 'g1', name: 'Uno', totalPoints: 100 }),
			entry({ groupId: 'g2', name: 'Dos', totalPoints: 300 }),
			entry({ groupId: 'g3', name: 'Tres', totalPoints: 200 }),
		]);
		expect(entries.map((e) => e.name)).toEqual(['Dos', 'Tres', 'Uno']);
		expect(entries.map((e) => e.position)).toEqual([1, 2, 3]);
	});

	it('comparte posición en empates reales y salta la posición siguiente', () => {
		const entries = rankEntries([
			entry({ groupId: 'g1', name: 'Uno', totalPoints: 100, lastScoredAt: '2026-01-01T10:00:00Z' }),
			entry({ groupId: 'g2', name: 'Dos', totalPoints: 100, lastScoredAt: '2026-01-01T10:00:00Z' }),
			entry({ groupId: 'g3', name: 'Tres', totalPoints: 50, lastScoredAt: '2026-01-01T11:00:00Z' }),
		]);
		// Entre entradas realmente empatadas el orden relativo es alfabético.
		expect(entries.map((e) => [e.name, e.position])).toEqual([
			['Dos', 1],
			['Uno', 1],
			['Tres', 3],
		]);
	});

	it('respeta el desempate temporal entre grupos con idéntica puntuación', () => {
		const entries = rankEntries([
			entry({ groupId: 'g1', name: 'Tardío', totalPoints: 100, lastScoredAt: '2026-01-01T12:00:00Z' }),
			entry({ groupId: 'g2', name: 'Temprano', totalPoints: 100, lastScoredAt: '2026-01-01T09:00:00Z' }),
		]);
		expect(entries.map((e) => e.name)).toEqual(['Temprano', 'Tardío']);
		expect(entries.map((e) => e.position)).toEqual([1, 2]);
	});

	it('deja intacta la entrada original (no muta las entradas)', () => {
		const original = [
			entry({ groupId: 'g1', name: 'Uno', totalPoints: 100 }),
			entry({ groupId: 'g2', name: 'Dos', totalPoints: 200 }),
		];
		const originalTotal = original.map((e) => e.totalPoints);
		rankEntries(original);
		expect(original.map((e) => e.totalPoints)).toEqual(originalTotal);
		expect('position' in (original[0] as object)).toBe(false);
	});
});

describe('tiedGroup', () => {
	it('devuelve todas las entradas que comparten posición y puntuación', () => {
		const entries = rankEntries([
			entry({ groupId: 'g1', name: 'Uno', totalPoints: 100, lastScoredAt: '2026-01-01T10:00:00Z' }),
			entry({ groupId: 'g2', name: 'Dos', totalPoints: 100, lastScoredAt: '2026-01-01T10:00:00Z' }),
			entry({ groupId: 'g3', name: 'Tres', totalPoints: 50 }),
		]);
		const target = entries.find((e) => e.name === 'Uno');
		expect(target).toBeDefined();
		expect(tiedGroup(entries, target!).map((e) => e.name).sort()).toEqual(['Dos', 'Uno']);
	});

	it('devuelve solo la propia entrada cuando no hay empate', () => {
		const entries = rankEntries([
			entry({ groupId: 'g1', name: 'Único', totalPoints: 200 }),
		]);
		expect(tiedGroup(entries, entries[0]!)).toHaveLength(1);
	});
});