/* ---------------------------------------------------------------------------
 * Tipos del dominio y de las filas de PostgreSQL (esquema local).
 * ------------------------------------------------------------------------- */

/** Estado de configuración de la aplicación (PostgreSQL). */
export interface ConfigState {
	configured: boolean;
	reason?: string;
}

export interface GroupRow {
	id: string;
	name: string;
	/** Código único y público del grupo (máx. 5 caracteres). No es secreto. */
	code: string;
	/** Indica si el grupo ya tiene código de acceso a la competición (hash). */
	has_access_code: boolean;
	color: string;
	active: boolean;
	created_at: string;
	updated_at: string;
}

export interface StudentRow {
	id: string;
	name: string;
	group_id: string | null;
	assignment_locked: boolean;
	active: boolean;
	created_at: string;
	updated_at: string;
}

export interface ExerciseRow {
	id: string;
	title: string;
	description: string | null;
	points: number;
	code_set: boolean;
	/** Modo del ejercicio: `code` (juego de códigos) o `css` (competición CSS). */
	kind: 'code' | 'css';
	active: boolean;
	archived: boolean;
	created_at: string;
	updated_at: string;
}

export interface SubmissionRow {
	id: string;
	student_id: string;
	group_id: string;
	exercise_id: string;
	awarded_points: number;
	submitted_at: string;
}

export interface GroupScoreRow {
	group_id: string;
	total_points: number;
	solved_count: number;
	last_scored_at: string | null;
	updated_at: string;
}

/**
 * Competición activa (ronda abierta). Define el ámbito de puntuación: cada
 * competición empieza a 0 y su marcador se calcula solo con sus eventos.
 */
export interface ActiveCompetition {
	roundId: string;
	exerciseId: string;
	exerciseTitle: string;
	startedAt: string;
}

/** Modo de aplicación de la penalización por errores de CSS. */
export type PenaltyMode = 'per_property' | 'per_submission';

export interface CompetitionSettingsRow {
	id: boolean;
	name: string;
	/** Puntos por defecto de los ejercicios nuevos. */
	default_points: number;
	assignments_locked_by_default: boolean;
	allow_admin_assignment_correction: boolean;
	submission_max_attempts: number;
	submission_window_seconds: number;
	/** Máximo de intentos de acceso de grupo por código (ventana). */
	css_login_max_attempts: number;
	css_login_window_seconds: number;
	/** Bonificación por velocidad (0 = desactivada). */
	css_speed_bonus_points: number;
	css_speed_bonus_seconds: number;
	/** Penalización configurable por errores de CSS. */
	penalty_enabled: boolean;
	/** Puntuación base por propiedad correcta para las reglas CSS nuevas. */
	css_points_per_property: number;
	penalty_points: number;
	penalty_mode: PenaltyMode;
	/** Si es falso, el saldo del grupo nunca baja de cero. */
	allow_negative_score: boolean;
	updated_at: string;
}

/** Fila de la vista pública `ranking`. */
export interface RankingRow {
	group_id: string;
	name: string;
	color: string;
	active: boolean;
	total_points: number;
	solved_count: number;
	last_scored_at: string | null;
	updated_at: string;
}

/** Resolución con los nombres relacionados, para el historial admin. */
export interface SubmissionDetail {
	id: string;
	student_id: string;
	group_id: string;
	exercise_id: string;
	awarded_points: number;
	submitted_at: string;
	exercise: { title: string } | null;
	student: { name: string } | null;
	group: { name: string; color: string } | null;
}

/** Entrada preparada para mostrar en el ranking. */
export interface RankingEntry {
	groupId: string;
	name: string;
	color: string;
	active: boolean;
	totalPoints: number;
	solvedCount: number;
	lastScoredAt: string | null;
	/** Posición 1-based ya calculada. */
	position: number;
}

export type SubmissionStatus =
	| 'success'
	| 'already_solved'
	| 'wrong_code'
	| 'invalid_code'
	| 'invalid_student'
	| 'inactive_student'
	| 'inactive_group'
	| 'no_group'
	| 'rate_limited'
	| 'error';

export interface SubmissionResult {
	status: SubmissionStatus;
	message: string;
	points?: number;
	groupId?: string;
	exerciseId?: string;
}

export interface CompletedExercise {
	exercise_id: string;
	title: string;
	points: number;
	submitted_at: string;
}

export interface PendingExercise {
	id: string;
	title: string;
	description: string | null;
	points: number;
}

export interface StudentPortalData {
	status: 'ok' | 'invalid_student';
	message?: string;
	student?: {
		id: string;
		name: string;
		active: boolean;
	};
	group?: {
		id: string;
		name: string;
		color: string;
	} | null;
	completed?: CompletedExercise[];
	pending?: PendingExercise[];
}

/* ---------------------------------------------------------------------------
 * Competición CSS granular (grupos en un ordenador compartido).
 * ------------------------------------------------------------------------- */

export interface CssActiveRound {
	id: string;
	exerciseId: string;
	startedAt: string;
}

export interface CssExerciseAdmin {
	id: string;
	title: string;
	description: string | null;
	active: boolean;
	archived: boolean;
	created_at: string;
	updated_at: string;
	/** Número de selectores activos del ejercicio. */
	selector_count: number;
	/** Ronda activa de este ejercicio, si la hay. */
	round: CssActiveRound | null;
}

/**
 * Competición (ejecución concreta, `competition_rounds`) tal como se muestra en
 * el panel de administración para poder revisarla o eliminarla.
 */
export interface CompetitionRoundAdmin {
	id: string;
	exerciseId: string;
	exerciseTitle: string;
	startedAt: string;
	endedAt: string | null;
	status: 'open' | 'ended';
	/** Grupos inscritos en la ejecución (roster fijo). */
	participantCount: number;
	/** Eventos de puntuación (incluidas penalizaciones) de la ejecución. */
	scoringEventCount: number;
	/** Propiedades resueltas registradas en la ejecución. */
	propertyScoreCount: number;
}

/** Resumen devuelto al eliminar una competición. */
export interface DeletedCompetitionRound {
	id: string;
	exerciseId: string;
	exerciseTitle: string;
	wasOpen: boolean;
	participants: number;
	scoringEvents: number;
	groupsRecomputed: number;
}

/**
 * Código de acceso de un grupo para el panel. `code` es el código completo
 * (recuperado del cifrado), o `null` si el grupo no tiene código o si el código
 * es anterior a la recuperación y no puede descifrarse.
 */
export interface GroupAccessCode {
	groupId: string;
	hasAccessCode: boolean;
	code: string | null;
}

export interface CssRuleAdmin {
	id: string;
	selector_id: string;
	/** Propiedad en minúsculas (p. ej. `background-color`). */
	property_name: string;
	/** Valor esperado en forma canónica (se muestra al admin para editarlo). */
	expected_value: string;
	points: number;
}

export interface CssSelectorAdmin {
	id: string;
	exercise_id: string;
	selector: string;
	position: number;
	active: boolean;
	rules: CssRuleAdmin[];
}

/** Vista pública de un ejercicio para el grupo (sin soluciones). */
export interface CompetitionExerciseView {
	id: string;
	title: string;
	description: string | null;
}

/** Estado de un selector para el grupo: sin revelar propiedades concretas. */
export type SelectorStatus = 'pending' | 'in_progress' | 'completed';

/** Selector del ejercicio con su estado agregado (información pública). */
export interface CompetitionSelectorView {
	id: string;
	selector: string;
	status: SelectorStatus;
}

/** Progreso general del ejercicio a nivel de selector. */
export interface CompetitionProgress {
	completed: number;
	total: number;
}

export interface CompetitionState {
	status: 'ok' | 'no_round' | 'inactive_group' | 'not_participating';
	message?: string;
	group: {
		id: string;
		name: string;
		color: string;
	};
	exercise?: CompetitionExerciseView;
	/** Todos los selectores activos del ejercicio, con su estado. */
	selectors: CompetitionSelectorView[];
	/** Progreso agregado (selectores completados / totales). */
	progress: CompetitionProgress;
	allSelectorsDone: boolean;
	totalPoints: number;
	/** Posición del grupo en el ranking agregado (1-based). */
	position?: number;
	ranking: RankingEntry[];
}

export interface CompetitionSubmitResult {
	status: 'ok' | string;
	/** Puntos positivos concedidos en esta entrega (propiedades + bonificación). */
	awarded: number;
	/** Penalización realmente aplicada (>= 0). */
	penalty: number;
	/** Saldo neto del intento (awarded - penalty). */
	net: number;
	new_properties: number;
	fully_correct: boolean;
	speed_bonus: boolean;
	message: string;
}

/* ---------------------------------------------------------------------------
 * Importación de CSS de referencia (panel de administración).
 * ------------------------------------------------------------------------- */

/** Declaración detectada en el CSS de referencia. */
export interface CssImportDeclaration {
	name: string;
	expectedValue: string;
}

/** Selector individual detectado en el CSS de referencia. */
export interface CssImportSelectorPreview {
	selector: string;
	canonical: string;
	declarations: CssImportDeclaration[];
}

/** Resultado del análisis de un bloque CSS (solo administración). */
export interface CssImportAnalysis {
	ok: boolean;
	selectors: CssImportSelectorPreview[];
	warnings: string[];
	errors: string[];
	stats: {
		selectorCount: number;
		declarationCount: number;
	};
	/** Puntos base configurados en la competición. */
	basePoints: number;
}

/** Estructura revisada que se envía para guardar la importación. */
export interface CssImportSavePayload {
	exerciseId: string | null;
	title: string;
	description: string | null;
	basePoints: number;
	selectors: Array<{
		selector: string;
		declarations: Array<{ name: string; expectedValue: string; points: number }>;
	}>;
}

export interface CssImportSaveSummary {
	exerciseId: string;
	selectorCount: number;
	ruleCount: number;
}

/* ---------------------------------------------------------------------------
 * Mantenimiento de datos (purga masiva de grupos y alumnos).
 * ------------------------------------------------------------------------- */

/** Alcance de una operación de mantenimiento masiva. */
export type PurgeScope = 'groups' | 'students' | 'both';

/**
 * Recuento (calculado en el servidor) de lo que existe antes de una purga. Se
 * usa para mostrar el alcance real de la operación antes de confirmarla.
 */
export interface PurgePreview {
	/** Registros que se eliminarían. */
	groups: number;
	students: number;
	submissions: number;
	scoringEvents: number;
	propertyScores: number;
	groupAttempts: number;
	participants: number;
	groupSessions: number;
	/** Registros que se conservan (informativo). */
	rounds: number;
	exercises: number;
}

/** Resumen devuelto tras ejecutar una purga (recuentos reales). */
export interface PurgeResult {
	scope: PurgeScope;
	groupsDeleted: number;
	studentsDeleted: number;
	submissionsDeleted: number;
	scoringEventsDeleted: number;
	propertyScoresDeleted: number;
	groupAttemptsDeleted: number;
	participantsDeleted: number;
	groupSessionsDeleted: number;
	/** Grupos cuyo marcador se recalculó (al eliminar solo alumnos). */
	groupsRecomputed: number;
}

/* ---------------------------------------------------------------------------
 * Dungeon Coder: La Oca del Caos (partidas y grupos participantes).
 *
 * Fase 2: solo persistencia de partidas en estado inicial. No hay tablero,
 * turnos, retos ni puntuación, y nada de esto se mezcla con la competición CSS.
 * ------------------------------------------------------------------------- */

/** Estado de una partida de La Oca. De momento solo existe el inicial. */
export type OcaGameStatus = 'created';

/** Grupo que participa en una partida, con su fecha de asociación. */
export interface OcaGameParticipant {
	id: string;
	name: string;
	color: string;
	joined_at: string;
}

/** Partida tal como se administra en el panel docente. */
export interface OcaGameRow {
	id: string;
	name: string;
	status: OcaGameStatus;
	created_by: string | null;
	created_at: string;
	updated_at: string;
	participants: OcaGameParticipant[];
}

/** Partida tal como la ve un grupo (sin datos internos de administración). */
export interface OcaGameForGroup {
	id: string;
	name: string;
	status: OcaGameStatus;
	created_at: string;
	participants: OcaGameParticipant[];
}
