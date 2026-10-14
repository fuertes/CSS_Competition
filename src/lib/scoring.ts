/**
 * Reglas de puntuación expresadas como funciones puras.
 *
 * Estas reglas se aplican de verdad en la base de datos (función
 * `submit_exercise_code` + restricción UNIQUE en `submissions`). Las funciones
 * de este módulo se usan para documentar el comportamiento y para probarlo de
 * forma rápida y aislada.
 */

export interface SubmissionRecord {
	groupId: string;
	exerciseId: string;
}

/** ¿El grupo ya resolvió este ejercicio? */
export function hasGroupSolved(
	submissions: SubmissionRecord[],
	groupId: string,
	exerciseId: string,
): boolean {
	return submissions.some(
		(submission) => submission.groupId === groupId && submission.exerciseId === exerciseId,
	);
}

/** Puntos válidos a otorgar, o `null` si el grupo ya resolvió el ejercicio. */
export function awardAtMostOnce(
	submissions: SubmissionRecord[],
	groupId: string,
	exerciseId: string,
	points: number,
): { points: number } | null {
	if (points <= 0) return null;
	if (hasGroupSolved(submissions, groupId, exerciseId)) return null;
	return { points };
}

/**
 * Aplica el envío a una lista inmutable de resoluciones. Devuelve la lista
 * actualizada y los puntos otorgados, o la misma lista y `null` si era un
 * duplicado. Modela el comportamiento atómico esperado de la base de datos.
 */
export function applySubmission(
	submissions: SubmissionRecord[],
	groupId: string,
	exerciseId: string,
	points: number,
): { submissions: SubmissionRecord[]; awardedPoints: number | null } {
	if (hasGroupSolved(submissions, groupId, exerciseId)) {
		return { submissions, awardedPoints: null };
	}
	return {
		submissions: [...submissions, { groupId, exerciseId }],
		awardedPoints: points,
	};
}