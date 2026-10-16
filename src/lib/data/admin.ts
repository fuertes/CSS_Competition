import type {
	ActiveCompetition,
	CompetitionRoundAdmin,
	CompetitionSettingsRow,
	CssExerciseAdmin,
	CssImportAnalysis,
	CssImportSavePayload,
	CssImportSaveSummary,
	CssRuleAdmin,
	CssSelectorAdmin,
	DeletedCompetitionRound,
	ExerciseRow,
	GroupAccessCode,
	GroupRow,
	GroupScoreRow,
	OcaGameRow,
	PurgePreview,
	PurgeResult,
	PurgeScope,
	StudentRow,
	SubmissionDetail,
} from '@/types';

export type { SubmissionDetail } from '@/types';

/**
 * Capa de datos administrativa (navegador).
 *
 * Habla con los endpoints `/api/admin/*` del servidor. El servidor valida la
 * sesión de administrador, aplica las reglas de negocio en PostgreSQL y jamás
 * expone la base de datos ni los códigos secretos al navegador.
 */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
	if (!response.ok) {
		throw new Error(body.error ?? `Error del servidor (${response.status}).`);
	}
	return body;
}

function getJson<T>(url: string): Promise<T> {
	return request<T>(url, { headers: { accept: 'application/json' } });
}

function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
	return request<T>(url, {
		method,
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

// --- Lecturas ----------------------------------------------------------------

export async function listGroups(): Promise<GroupRow[]> {
	const { groups } = await getJson<{ groups: GroupRow[] }>('/api/admin/groups');
	return groups;
}

export async function listGroupScores(): Promise<GroupScoreRow[]> {
	const { groupScores } = await getJson<{ groupScores: GroupScoreRow[] }>('/api/admin/scores');
	return groupScores;
}

/** Marcador aislado de la competición activa (vacío si no hay ninguna abierta). */
export async function listCompetitionScores(): Promise<GroupScoreRow[]> {
	const { competitionScores } = await getJson<{ competitionScores: GroupScoreRow[] }>(
		'/api/admin/scores',
	);
	return competitionScores;
}

/** Información de la competición activa (ronda abierta), si la hay. */
export async function getActiveCompetition(): Promise<ActiveCompetition | null> {
	const { activeCompetition } = await getJson<{ activeCompetition: ActiveCompetition | null }>(
		'/api/admin/scores',
	);
	return activeCompetition;
}

export async function listStudents(): Promise<StudentRow[]> {
	const { students } = await getJson<{ students: StudentRow[] }>('/api/admin/students');
	return students;
}

export async function listExercises(): Promise<ExerciseRow[]> {
	const { exercises } = await getJson<{ exercises: ExerciseRow[] }>('/api/admin/exercises');
	return exercises;
}

export async function listSubmissions(): Promise<SubmissionDetail[]> {
	const { submissions } = await getJson<{ submissions: SubmissionDetail[] }>('/api/admin/scores');
	return submissions;
}

export async function getSettings(): Promise<CompetitionSettingsRow | null> {
	const { settings } = await getJson<{ settings: CompetitionSettingsRow | null }>(
		'/api/admin/settings',
	);
	return settings;
}

// --- Operaciones de escritura ------------------------------------------------

export async function createGroup(input: {
	name: string;
	color: string;
	active: boolean;
}): Promise<void> {
	await sendJson('/api/admin/groups', 'POST', input);
}

export async function updateGroup(
	id: string,
	input: Partial<{ name: string; color: string; active: boolean }>,
): Promise<void> {
	await sendJson('/api/admin/groups', 'PUT', { id, ...input });
}

export async function deleteGroup(id: string): Promise<void> {
	await request(`/api/admin/groups?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function createStudent(input: {
	name: string;
	group_id: string | null;
	active: boolean;
}): Promise<string> {
	const { id } = await sendJson<{ id: string }>('/api/admin/students', 'POST', input);
	return id;
}

export async function updateStudent(
	id: string,
	input: Partial<{ name: string; group_id: string | null; active: boolean }>,
): Promise<void> {
	await sendJson('/api/admin/students', 'PUT', { id, ...input });
}

export async function deleteStudent(id: string): Promise<void> {
	await request(`/api/admin/students?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function createExercise(input: {
	title: string;
	description: string | null;
	points: number;
	active: boolean;
}): Promise<string> {
	const { id } = await sendJson<{ id: string }>('/api/admin/exercises', 'POST', input);
	return id;
}

export async function updateExercise(
	id: string,
	input: Partial<{
		title: string;
		description: string | null;
		points: number;
		active: boolean;
		archived: boolean;
	}>,
): Promise<void> {
	await sendJson('/api/admin/exercises', 'PUT', { id, ...input });
}

export async function deleteExercise(id: string): Promise<void> {
	await request(`/api/admin/exercises?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function setExerciseCode(id: string, code: string): Promise<void> {
	await sendJson('/api/admin/exercises/code', 'POST', { exerciseId: id, code });
}

export async function setStudentAccessCode(id: string, code: string): Promise<void> {
	await sendJson('/api/admin/students/code', 'POST', { studentId: id, code });
}

export async function confirmAssignment(studentId: string, groupId: string): Promise<void> {
	await sendJson('/api/admin/assignments', 'POST', {
		action: 'confirm',
		studentId,
		groupId,
	});
}

export async function clearAssignment(studentId: string): Promise<void> {
	await sendJson('/api/admin/assignments', 'POST', { action: 'clear', studentId });
}

export async function correctAssignment(
	studentId: string,
	groupId: string,
	reason: string,
): Promise<void> {
	await sendJson('/api/admin/assignments', 'POST', {
		action: 'correct',
		studentId,
		groupId,
		reason,
	});
}

export async function updateSettings(
	input: Partial<Omit<CompetitionSettingsRow, 'id' | 'updated_at'>>,
): Promise<void> {
	await sendJson('/api/admin/settings', 'PUT', input);
}

// --- Competición CSS ---------------------------------------------------------

export async function generateGroupAccessCode(groupId: string): Promise<string> {
	const { code } = await sendJson<{ code: string }>('/api/admin/groups/code', 'POST', { groupId });
	return code;
}

/** Código de acceso completo de cada grupo (recuperado del cifrado). */
export async function listGroupAccessCodes(): Promise<GroupAccessCode[]> {
	const { codes } = await getJson<{ codes: GroupAccessCode[] }>('/api/admin/groups/access-codes');
	return codes;
}

export async function listCssExercises(): Promise<CssExerciseAdmin[]> {
	const { exercises } = await getJson<{ exercises: CssExerciseAdmin[] }>('/api/admin/css/exercises');
	return exercises;
}

export async function createCssExercise(input: {
	title: string;
	description: string | null;
}): Promise<string> {
	const { id } = await sendJson<{ id: string }>('/api/admin/css/exercises', 'POST', input);
	return id;
}

export async function updateCssExercise(
	id: string,
	input: Partial<{ title: string; description: string | null; active: boolean; archived: boolean }>,
): Promise<void> {
	await sendJson('/api/admin/css/exercise', 'PUT', { id, ...input });
}

export async function deleteCssExercise(id: string): Promise<void> {
	await request(`/api/admin/css/exercise?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function listCssSelectors(exerciseId: string): Promise<CssSelectorAdmin[]> {
	const { selectors } = await getJson<{ selectors: CssSelectorAdmin[] }>(
		`/api/admin/css/selectors?exerciseId=${encodeURIComponent(exerciseId)}`,
	);
	return selectors;
}

export async function createCssSelector(input: {
	exerciseId: string;
	selector: string;
}): Promise<CssSelectorAdmin> {
	const { selector } = await sendJson<{ selector: CssSelectorAdmin }>(
		'/api/admin/css/selectors',
		'POST',
		input,
	);
	return selector;
}

export async function updateCssSelector(
	id: string,
	input: Partial<{ selector: string; active: boolean }>,
): Promise<void> {
	await sendJson('/api/admin/css/selector', 'PUT', { id, ...input });
}

export async function deleteCssSelector(id: string): Promise<void> {
	await request(`/api/admin/css/selector?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function createCssRule(input: {
	selectorId: string;
	property: string;
	expectedValue: string;
	points: number;
}): Promise<CssRuleAdmin> {
	const { rule } = await sendJson<{ rule: CssRuleAdmin }>('/api/admin/css/rules', 'POST', input);
	return rule;
}

export async function updateCssRule(
	id: string,
	input: Partial<{ property: string; expectedValue: string; points: number }>,
): Promise<void> {
	await sendJson('/api/admin/css/rule', 'PUT', { id, ...input });
}

export async function deleteCssRule(id: string): Promise<void> {
	await request(`/api/admin/css/rule?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function startCompetitionRound(exerciseId: string): Promise<string> {
	const { id } = await sendJson<{ id: string }>('/api/admin/css/rounds', 'POST', { exerciseId });
	return id;
}

export async function endCompetitionRound(): Promise<string> {
	const { id } = await sendJson<{ id: string }>('/api/admin/css/rounds/end', 'POST', {});
	return id;
}

/** Lista las competiciones (ejecuciones) registradas. */
export async function listCompetitionRounds(): Promise<CompetitionRoundAdmin[]> {
	const { rounds } = await getJson<{ rounds: CompetitionRoundAdmin[] }>('/api/admin/css/rounds');
	return rounds;
}

/** Elimina una competición (ejecución) con sus datos dependientes. */
export async function deleteCompetitionRound(id: string): Promise<DeletedCompetitionRound> {
	const { result } = await request<{ ok: boolean; result: DeletedCompetitionRound }>(
		`/api/admin/css/rounds?id=${encodeURIComponent(id)}`,
		{ method: 'DELETE' },
	);
	return result;
}

// --- Mantenimiento de datos --------------------------------------------------

/** Recuento (del servidor) de lo que existe antes de una purga masiva. */
export async function getPurgePreview(): Promise<PurgePreview> {
	const { preview } = await getJson<{ preview: PurgePreview }>('/api/admin/maintenance/purge');
	return preview;
}

/** Ejecuta una purga masiva (grupos, alumnos o ambos) con la frase de confirmación. */
export async function purgeEntities(
	scope: PurgeScope,
	confirmation: string,
): Promise<PurgeResult> {
	const { result } = await sendJson<{ ok: boolean; result: PurgeResult }>(
		'/api/admin/maintenance/purge',
		'POST',
		{ scope, confirmation },
	);
	return result;
}

// --- Importación de CSS de referencia ---------------------------------------
export async function analyzeCssImport(css: string): Promise<CssImportAnalysis> {
	return sendJson<CssImportAnalysis>('/api/admin/css/import/analyze', 'POST', { css });
}

export async function saveCssImport(
	input: CssImportSavePayload,
): Promise<CssImportSaveSummary> {
	const { summary } = await sendJson<{ ok: boolean; summary: CssImportSaveSummary }>(
		'/api/admin/css/import/save',
		'POST',
		input,
	);
	return summary;
}

// --- La Oca del Caos ---------------------------------------------------------

/** Partidas creadas (panel docente). */
export async function listOcaGames(): Promise<OcaGameRow[]> {
	const { games } = await getJson<{ games: OcaGameRow[] }>('/api/admin/oca/games');
	return games;
}

/**
 * Crea una partida de La Oca con los grupos indicados. El servidor vuelve a
 * comprobar que los grupos existen y están activos.
 */
export async function createOcaGame(input: {
	name: string;
	groupIds: string[];
}): Promise<OcaGameRow> {
	const { game } = await sendJson<{ ok: boolean; game: OcaGameRow }>(
		'/api/admin/oca/games',
		'POST',
		input,
	);
	return game;
}