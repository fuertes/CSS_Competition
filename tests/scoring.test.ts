import { describe, it, expect } from 'vitest';
import {
	awardAtMostOnce,
	applySubmission,
	hasGroupSolved,
	type SubmissionRecord,
} from '@/lib/scoring';

const GROUP = 'group-1';
const EXERCISE = 'exercise-1';

function submission(groupId = GROUP, exerciseId = EXERCISE): SubmissionRecord {
	return { groupId, exerciseId };
}

describe('hasGroupSolved', () => {
	it('detecta una resolución previa del mismo grupo y ejercicio', () => {
		expect(hasGroupSolved([submission()], GROUP, EXERCISE)).toBe(true);
	});

	it('distingue entre grupos y entre ejercicios', () => {
		expect(hasGroupSolved([submission()], 'group-2', EXERCISE)).toBe(false);
		expect(hasGroupSolved([submission()], GROUP, 'exercise-2')).toBe(false);
	});
});

describe('awardAtMostOnce', () => {
	it('otorga los puntos si el grupo no ha resuelto el ejercicio', () => {
		expect(awardAtMostOnce([], GROUP, EXERCISE, 100)).toEqual({ points: 100 });
	});

	it('no otorga puntos si el grupo ya resolvió el ejercicio', () => {
		expect(awardAtMostOnce([submission()], GROUP, EXERCISE, 100)).toBeNull();
	});

	it('no otorga puntos con valores no positivos', () => {
		expect(awardAtMostOnce([], GROUP, EXERCISE, 0)).toBeNull();
		expect(awardAtMostOnce([], GROUP, EXERCISE, -5)).toBeNull();
	});
});

describe('applySubmission', () => {
	it('registra la resolución y otorga los puntos la primera vez', () => {
		const result = applySubmission([], GROUP, EXERCISE, 100);
		expect(result.awardedPoints).toBe(100);
		expect(result.submissions).toEqual([submission()]);
	});

	it('no duplica la resolución ni otorga puntos en un envío repetido', () => {
		const result = applySubmission([submission()], GROUP, EXERCISE, 100);
		expect(result.awardedPoints).toBeNull();
		expect(result.submissions).toHaveLength(1);
	});

	it('respeta la inmutabilidad: no modifica la lista original al fallar', () => {
		const original = [submission()];
		const result = applySubmission(original, GROUP, EXERCISE, 100);
		expect(result.submissions).toBe(original);
		expect(original).toHaveLength(1);
	});

	it('un grupo distinto puede resolver el mismo ejercicio', () => {
		const result = applySubmission([submission()], 'group-2', EXERCISE, 100);
		expect(result.awardedPoints).toBe(100);
		expect(result.submissions).toHaveLength(2);
	});
});