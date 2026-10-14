import 'server-only';
import type { Pool, PoolClient } from 'pg';
import type {
	CompetitionSettingsRow,
	ExerciseRow,
	GroupRow,
	GroupScoreRow,
	RankingRow,
	StudentRow,
	SubmissionDetail,
	SubmissionResult,
	StudentPortalData,
} from '@/types';
import type {
	ExerciseUpdateInput,
	GroupUpdateInput,
	SettingsUpdateInput,
	StudentUpdateInput,
} from '@/lib/validation';

/* ---------------------------------------------------------------------------
 * Traducción de errores de PostgreSQL a mensajes comprensibles.
 * ------------------------------------------------------------------------- */

const DB_ERROR_MESSAGES: Record<string, string> = {
	'23503': 'La operación fue rechazada: existen registros relacionados (resoluciones o asignaciones).',
	'23505': 'Ya existe un registro con ese nombre o código.',
	'23514': 'La operación no es válida según las reglas de la competición.',
	'P0002': 'No se encontró el registro solicitado.',
	'42501': 'No tienes permisos para realizar esta operación.',
	'22023': 'Datos no válidos.',
	'08001': 'No se pudo conectar con la base de datos.',
	'57P03': 'La base de datos no está disponible.',
};

function translateDbError(error: unknown): Error {
	const message = error instanceof Error ? error.message : String(error);
	const code = (error as { code?: string })?.code;
	const translated = code ? DB_ERROR_MESSAGES[code] : undefined;
	return new Error(translated ?? message);
}

export async function run<T>(operation: () => Promise<T>): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		throw translateDbError(error);
	}
}

/**
 * Ejecuta una operación dentro de una transacción PostgreSQL.
 *
 * Reserva una conexión del pool, abre la transacción, ejecuta la función y hace
 * COMMIT. Ante cualquier error hace ROLLBACK y traduce el error de PostgreSQL.
 * Garantiza que una operación compuesta (como una importación con varios
 * selectores y reglas) no deje datos parcialmente guardados.
 */
export async function withTransaction<T>(
	pool: Pool,
	operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query('begin');
		const result = await operation(client);
		await client.query('commit');
		return result;
	} catch (error) {
		try {
			await client.query('rollback');
		} catch {
			// Si el ROLLBACK falla la conexión se descarta al liberarla.
		}
		throw translateDbError(error);
	} finally {
		client.release();
	}
}

/** Convierte fechas de PostgreSQL a ISO para serializarlas como JSON. */
export function toIso(value: Date | string | null): string | null {
	if (value == null) return null;
	return value instanceof Date ? value.toISOString() : value;
}

/* ---------------------------------------------------------------------------
 * Lecturas
 * ------------------------------------------------------------------------- */

interface GroupDbRow {
	id: string;
	name: string;
	code: string;
	has_access_code: boolean;
	color: string;
	active: boolean;
	created_at: Date;
	updated_at: Date;
}

export async function listGroups(pool: Pool): Promise<GroupRow[]> {
	return run(async () => {
		const { rows } = await pool.query<GroupDbRow>(
			`select ${GROUP_COLUMNS}
			 from public.groups order by name asc`,
		);
		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			code: row.code,
			has_access_code: row.has_access_code,
			color: row.color,
			active: row.active,
			created_at: toIso(row.created_at)!,
			updated_at: toIso(row.updated_at)!,
		}));
	});
}

interface StudentDbRow {
	id: string;
	name: string;
	group_id: string | null;
	assignment_locked: boolean;
	active: boolean;
	created_at: Date;
	updated_at: Date;
}

export async function listStudents(pool: Pool): Promise<StudentRow[]> {
	return run(async () => {
		const { rows } = await pool.query<StudentDbRow>(
			`select id, name, group_id, assignment_locked, active, created_at, updated_at
			 from public.students order by name asc`,
		);
		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			group_id: row.group_id,
			assignment_locked: row.assignment_locked,
			active: row.active,
			created_at: toIso(row.created_at)!,
			updated_at: toIso(row.updated_at)!,
		}));
	});
}

interface ExerciseDbRow {
	id: string;
	title: string;
	description: string | null;
	points: number;
	code_set: boolean;
	kind: 'code' | 'css';
	active: boolean;
	archived: boolean;
	created_at: Date;
	updated_at: Date;
}

export async function listExercises(pool: Pool): Promise<ExerciseRow[]> {
	return run(async () => {
		const { rows } = await pool.query<ExerciseDbRow>(
			`select ${EXERCISE_COLUMNS}
			 from public.exercises order by created_at desc`,
		);
		return rows.map((row) => ({
			id: row.id,
			title: row.title,
			description: row.description,
			points: row.points,
			code_set: row.code_set,
			kind: row.kind,
			active: row.active,
			archived: row.archived,
			created_at: toIso(row.created_at)!,
			updated_at: toIso(row.updated_at)!,
		}));
	});
}

interface GroupScoreDbRow {
	group_id: string;
	total_points: number;
	solved_count: number;
	last_scored_at: Date | null;
	updated_at: Date;
}

export async function listGroupScores(pool: Pool): Promise<GroupScoreRow[]> {
	return run(async () => {
		const { rows } = await pool.query<GroupScoreDbRow>(
			`select group_id, total_points, solved_count, last_scored_at, updated_at
			 from public.group_scores order by total_points desc`,
		);
		return rows.map((row) => ({
			group_id: row.group_id,
			total_points: row.total_points,
			solved_count: row.solved_count,
			last_scored_at: toIso(row.last_scored_at),
			updated_at: toIso(row.updated_at)!,
		}));
	});
}

/** Competición activa (ronda abierta) para las consultas administrativas. */
export interface ActiveCompetition {
	roundId: string;
	exerciseId: string;
	exerciseTitle: string;
	startedAt: string;
}

export async function getActiveCompetition(pool: Pool): Promise<ActiveCompetition | null> {
	return run(async () => {
		const { rows } = await pool.query<{
			round_id: string;
			exercise_id: string;
			title: string;
			started_at: Date;
		}>(
			`select r.id as round_id, e.id as exercise_id, e.title, r.started_at
			 from public.competition_rounds r
			 join public.exercises e on e.id = r.exercise_id
			 where r.ended_at is null
			 order by r.started_at desc
			 limit 1`,
		);
		const row = rows[0];
		if (!row) return null;
		return {
			roundId: row.round_id,
			exerciseId: row.exercise_id,
			exerciseTitle: row.title,
			startedAt: toIso(row.started_at)!,
		};
	});
}

/**
 * Marcador de la competición activa, aislado por ronda. Devuelve las
 * puntuaciones EXCLUSIVAMENTE de la competición abierta (o vacío si no hay).
 */
export async function listCompetitionScores(pool: Pool): Promise<GroupScoreRow[]> {
	return run(async () => {
		const roundId = await getActiveRoundId(pool);
		if (!roundId) return [];
		const { rows } = await pool.query<GroupScoreDbRow>(
			`select group_id, total_points, solved_count, last_scored_at, updated_at
			 from public.round_ranking($1)
			 order by total_points desc`,
			[roundId],
		);
		return rows.map((row) => ({
			group_id: row.group_id,
			total_points: row.total_points,
			solved_count: row.solved_count,
			last_scored_at: toIso(row.last_scored_at),
			updated_at: toIso(row.updated_at)!,
		}));
	});
}

interface SubmissionJoinRow {
	id: string;
	student_id: string;
	group_id: string;
	exercise_id: string;
	awarded_points: number;
	submitted_at: Date;
	exercise_title: string | null;
	student_name: string | null;
	group_name: string | null;
	group_color: string | null;
}

export async function listSubmissions(pool: Pool): Promise<SubmissionDetail[]> {
	return run(async () => {
		const { rows } = await pool.query<SubmissionJoinRow>(
			`select
				s.id, s.student_id, s.group_id, s.exercise_id, s.awarded_points, s.submitted_at,
				e.title as exercise_title,
				st.name as student_name,
				g.name as group_name,
				g.color as group_color
			 from public.submissions s
			 join public.exercises e on e.id = s.exercise_id
			 left join public.students st on st.id = s.student_id
			 left join public.groups g on g.id = s.group_id
			 order by s.submitted_at desc
			 limit 500`,
		);
		return rows.map((row) => ({
			id: row.id,
			student_id: row.student_id,
			group_id: row.group_id,
			exercise_id: row.exercise_id,
			awarded_points: row.awarded_points,
			submitted_at: toIso(row.submitted_at)!,
			exercise: row.exercise_title ? { title: row.exercise_title } : null,
			student: row.student_name ? { name: row.student_name } : null,
			group:
				row.group_name && row.group_color
					? { name: row.group_name, color: row.group_color }
					: null,
		}));
	});
}

interface SettingsDbRow {
	id: boolean;
	name: string;
	default_points: number;
	assignments_locked_by_default: boolean;
	allow_admin_assignment_correction: boolean;
	submission_max_attempts: number;
	submission_window_seconds: number;
	css_login_max_attempts: number;
	css_login_window_seconds: number;
	css_speed_bonus_points: number;
	css_speed_bonus_seconds: number;
	penalty_enabled: boolean;
	css_points_per_property: number;
	penalty_points: number;
	penalty_mode: CompetitionSettingsRow['penalty_mode'];
	allow_negative_score: boolean;
	updated_at: Date;
}

export async function getSettings(pool: Pool): Promise<CompetitionSettingsRow | null> {
	return run(async () => {
		const { rows } = await pool.query<SettingsDbRow>(
			`select id, name, default_points, assignments_locked_by_default,
					allow_admin_assignment_correction, submission_max_attempts,
					submission_window_seconds, css_login_max_attempts,
					css_login_window_seconds, css_speed_bonus_points,
					css_speed_bonus_seconds, penalty_enabled, css_points_per_property,
					penalty_points, penalty_mode, allow_negative_score, updated_at
			 from public.competition_settings where id = true`,
		);
		const row = rows[0];
		if (!row) return null;
		return {
			id: row.id,
			name: row.name,
			default_points: row.default_points,
			assignments_locked_by_default: row.assignments_locked_by_default,
			allow_admin_assignment_correction: row.allow_admin_assignment_correction,
			submission_max_attempts: row.submission_max_attempts,
			submission_window_seconds: row.submission_window_seconds,
			css_login_max_attempts: row.css_login_max_attempts,
			css_login_window_seconds: row.css_login_window_seconds,
			css_speed_bonus_points: row.css_speed_bonus_points,
			css_speed_bonus_seconds: row.css_speed_bonus_seconds,
			penalty_enabled: row.penalty_enabled,
			css_points_per_property: row.css_points_per_property,
			penalty_points: row.penalty_points,
			penalty_mode: row.penalty_mode,
			allow_negative_score: row.allow_negative_score,
			updated_at: toIso(row.updated_at)!,
		};
	});
}

interface RankingDbRow {
	group_id: string;
	name: string;
	color: string;
	active: boolean;
	total_points: number;
	solved_count: number;
	last_scored_at: Date | null;
	updated_at: Date;
}

/**
 * Identificador de la competición activa (ronda abierta), si la hay.
 * El ámbito de puntuación de cada competición es su ronda.
 */
export async function getActiveRoundId(pool: Pool): Promise<string | null> {
	return run(async () => {
		const { rows } = await pool.query<{ id: string }>(
			`select id from public.competition_rounds
			 where ended_at is null
			 order by started_at desc
			 limit 1`,
		);
		return rows[0]?.id ?? null;
	});
}

/**
 * Clasificación de la competición activa.
 *
 * Si hay una ronda abierta, la clasificación se calcula EXCLUSIVAMENTE con los
 * eventos de esa competición (aislamiento total). Si no hay competición activa,
 * se muestra el marcador histórico agregado (`public.ranking`) para poder
 * consultar los resultados anteriores sin inventar datos.
 */
export async function fetchRankingRows(pool: Pool): Promise<RankingRow[]> {
	return run(async () => {
		const roundId = await getActiveRoundId(pool);
		const { rows } = roundId
			? await pool.query<RankingDbRow>('select * from public.round_ranking($1)', [roundId])
			: await pool.query<RankingDbRow>(
					`select group_id, name, color, active, total_points, solved_count, last_scored_at, updated_at
					 from public.ranking`,
				);
		return rows.map((row) => ({
			group_id: row.group_id,
			name: row.name,
			color: row.color,
			active: row.active,
			total_points: row.total_points,
			solved_count: row.solved_count,
			last_scored_at: toIso(row.last_scored_at),
			updated_at: toIso(row.updated_at)!,
		}));
	});
}

export interface AdminStats {
	students: number;
	groups: number;
	activeExercises: number;
	exerciseWithoutCode: number;
	solved: number;
	pendingAssignments: number;
}

export async function fetchAdminStats(
	pool: Pool,
): Promise<{ stats: AdminStats; ranking: RankingRow[] }> {
	const [stats, ranking] = await Promise.all([fetchStats(pool), fetchRankingRows(pool)]);
	return { stats, ranking };
}

async function fetchStats(pool: Pool): Promise<AdminStats> {
	return run(async () => {
		const { rows } = await pool.query<AdminStats>(
			`select
				(select count(*)::int from public.students) as students,
				(select count(*)::int from public.groups) as groups,
				(select count(*)::int from public.exercises
					where active and not archived) as active_exercises,
				(select count(*)::int from public.exercises
					where active and not archived and not code_set and kind = 'code') as exercise_without_code,
				(select count(*)::int from public.submissions) as solved,
				(select count(*)::int from public.students
					where group_id is null) as pending_assignments`,
		);
		const row = rows[0];
		if (!row) {
			return {
				students: 0,
				groups: 0,
				activeExercises: 0,
				exerciseWithoutCode: 0,
				solved: 0,
				pendingAssignments: 0,
			};
		}
		return row;
	});
}

/* ---------------------------------------------------------------------------
 * Escrituras administrativas (tablas)
 * ------------------------------------------------------------------------- */

const GROUP_COLUMNS =
	'id, name, code, (access_code_hash is not null) as has_access_code, color, active, created_at, updated_at';

/** Reintentos ante una colisión improbable del código único generado. */
const MAX_GROUP_CODE_RETRIES = 5;
const STUDENT_COLUMNS = 'id, name, group_id, assignment_locked, active, created_at, updated_at';
const EXERCISE_COLUMNS =
	'id, title, description, points, code_set, kind, active, archived, created_at, updated_at';

export async function createGroup(
	pool: Pool,
	input: { name: string; color: string; active: boolean },
): Promise<GroupRow> {
	return run(async () => {
		for (let attempt = 1; ; attempt += 1) {
			try {
				const { rows } = await pool.query<GroupDbRow>(
					`insert into public.groups (name, color, active)
					 values ($1, $2, $3) returning ${GROUP_COLUMNS}`,
					[input.name, input.color, input.active],
				);
				const row = rows[0];
				return {
					id: row.id,
					name: row.name,
					code: row.code,
					has_access_code: row.has_access_code,
					color: row.color,
					active: row.active,
					created_at: toIso(row.created_at)!,
					updated_at: toIso(row.updated_at)!,
				};
			} catch (error) {
				const pgError = error as { code?: string; constraint?: string };
				// El código lo genera la base de datos (trigger); si por una
				// colisión simultánea se choca con otro grupo, se reintenta.
				if (
					attempt < MAX_GROUP_CODE_RETRIES &&
					pgError.code === '23505' &&
					pgError.constraint === 'groups_code_unique'
				) {
					continue;
				}
				throw error;
			}
		}
	});
}

export async function updateGroup(
	pool: Pool,
	id: string,
	input: GroupUpdateInput,
): Promise<void> {
	return run(async () => {
		const columns: Array<[string, unknown]> = [];
		if (input.name !== undefined) columns.push(['name', input.name]);
		if (input.color !== undefined) columns.push(['color', input.color]);
		if (input.active !== undefined) columns.push(['active', input.active]);
		await updateById(pool, 'groups', columns, id);
	});
}

export async function deleteGroup(pool: Pool, id: string): Promise<void> {
	return run(async () => {
		await pool.query('delete from public.groups where id = $1', [id]);
	});
}

export async function createStudent(
	pool: Pool,
	input: { name: string; group_id: string | null; active: boolean },
): Promise<StudentRow> {
	return run(async () => {
		const { rows } = await pool.query<StudentDbRow>(
			`insert into public.students (name, group_id, active)
			 values ($1, $2, $3) returning ${STUDENT_COLUMNS}`,
			[input.name, input.group_id, input.active],
		);
		const row = rows[0];
		return {
			id: row.id,
			name: row.name,
			group_id: row.group_id,
			assignment_locked: row.assignment_locked,
			active: row.active,
			created_at: toIso(row.created_at)!,
			updated_at: toIso(row.updated_at)!,
		};
	});
}

export async function updateStudent(
	pool: Pool,
	id: string,
	input: StudentUpdateInput,
): Promise<void> {
	return run(async () => {
		if (input.group_id !== undefined) {
			// Regla de negocio: una asignación confirmada no se modifica por la
			// vía ordinaria (ni se mueve ni se desasigna sin pasar por la
			// corrección excepcional).
			const { rowCount } = await pool.query<StudentDbRow>(
				`select group_id, assignment_locked from public.students where id = $1`,
				[id],
			);
			if (rowCount && rowCount > 0) {
				const current = (
					await pool.query<{ group_id: string | null; assignment_locked: boolean }>(
						`select group_id, assignment_locked from public.students where id = $1`,
						[id],
					)
				).rows[0];
				if (current.assignment_locked && current.group_id !== input.group_id) {
					throw new Error(
						'La asignación de este alumno está bloqueada. Usa la corrección excepcional o desasígnalo primero.',
					);
				}
			}
		}

		const columns: Array<[string, unknown]> = [];
		if (input.name !== undefined) columns.push(['name', input.name]);
		if (input.group_id !== undefined) columns.push(['group_id', input.group_id]);
		if (input.active !== undefined) columns.push(['active', input.active]);
		await updateById(pool, 'students', columns, id);
	});
}

export async function deleteStudent(pool: Pool, id: string): Promise<void> {
	return run(async () => {
		await pool.query('delete from public.students where id = $1', [id]);
	});
}

export async function createExercise(
	pool: Pool,
	input: { title: string; description: string | null; points: number; active: boolean },
): Promise<ExerciseRow> {
	return run(async () => {
		const { rows } = await pool.query<ExerciseDbRow>(
			`insert into public.exercises (title, description, points, active)
			 values ($1, $2, $3, $4) returning ${EXERCISE_COLUMNS}`,
			[input.title, input.description, input.points, input.active],
		);
		const row = rows[0];
		return {
			id: row.id,
			title: row.title,
			description: row.description,
			points: row.points,
			code_set: row.code_set,
			kind: row.kind,
			active: row.active,
			archived: row.archived,
			created_at: toIso(row.created_at)!,
			updated_at: toIso(row.updated_at)!,
		};
	});
}

export async function updateExercise(
	pool: Pool,
	id: string,
	input: ExerciseUpdateInput,
): Promise<void> {
	return run(async () => {
		const columns: Array<[string, unknown]> = [];
		if (input.title !== undefined) columns.push(['title', input.title]);
		if (input.description !== undefined) columns.push(['description', input.description]);
		if (input.points !== undefined) columns.push(['points', input.points]);
		if (input.active !== undefined) columns.push(['active', input.active]);
		if (input.archived !== undefined) columns.push(['archived', input.archived]);
		await updateById(pool, 'exercises', columns, id);
	});
}

export async function deleteExercise(pool: Pool, id: string): Promise<void> {
	return run(async () => {
		await pool.query('delete from public.exercises where id = $1', [id]);
	});
}

export async function updateSettings(
	pool: Pool,
	input: SettingsUpdateInput,
): Promise<void> {
	return run(async () => {
		const columns: Array<[string, unknown]> = [];
		if (input.name !== undefined) columns.push(['name', input.name]);
		if (input.default_points !== undefined) columns.push(['default_points', input.default_points]);
		if (input.assignments_locked_by_default !== undefined) {
			columns.push(['assignments_locked_by_default', input.assignments_locked_by_default]);
		}
		if (input.allow_admin_assignment_correction !== undefined) {
			columns.push(['allow_admin_assignment_correction', input.allow_admin_assignment_correction]);
		}
		if (input.submission_max_attempts !== undefined) {
			columns.push(['submission_max_attempts', input.submission_max_attempts]);
		}
		if (input.submission_window_seconds !== undefined) {
			columns.push(['submission_window_seconds', input.submission_window_seconds]);
		}
		if (input.css_login_max_attempts !== undefined) {
			columns.push(['css_login_max_attempts', input.css_login_max_attempts]);
		}
		if (input.css_login_window_seconds !== undefined) {
			columns.push(['css_login_window_seconds', input.css_login_window_seconds]);
		}
		if (input.css_speed_bonus_points !== undefined) {
			columns.push(['css_speed_bonus_points', input.css_speed_bonus_points]);
		}
		if (input.css_speed_bonus_seconds !== undefined) {
			columns.push(['css_speed_bonus_seconds', input.css_speed_bonus_seconds]);
		}
		if (input.penalty_enabled !== undefined) {
			columns.push(['penalty_enabled', input.penalty_enabled]);
		}
		if (input.css_points_per_property !== undefined) {
			columns.push(['css_points_per_property', input.css_points_per_property]);
		}
		if (input.penalty_points !== undefined) {
			columns.push(['penalty_points', input.penalty_points]);
		}
		if (input.penalty_mode !== undefined) {
			columns.push(['penalty_mode', input.penalty_mode]);
		}
		if (input.allow_negative_score !== undefined) {
			columns.push(['allow_negative_score', input.allow_negative_score]);
		}
		if (columns.length === 0) return;

		const sets = columns.map(([column], index) => `${column} = $${index + 1}`);
		const values = columns.map(([, value]) => value);
		await pool.query(
			`update public.competition_settings
			 set ${sets.join(', ')}, updated_at = now()
			 where id = true`,
			values,
		);
	});
}

/** Actualiza columnas conocidas de una tabla por id (lista blanca de tablas). */
async function updateById(
	pool: Pool,
	table: 'groups' | 'students' | 'exercises',
	columns: Array<[string, unknown]>,
	id: string,
): Promise<void> {
	if (columns.length === 0) return;
	const sets = columns.map(([column], index) => `${column} = $${index + 1}`);
	const values = columns.map(([, value]) => value);
	await pool.query(
		`update public.${table} set ${sets.join(', ')} where id = $${columns.length + 1}`,
		[...values, id],
	);
}

/* ---------------------------------------------------------------------------
 * Funciones privilegiadas de la base de datos (administración)
 * ------------------------------------------------------------------------- */

export async function setExerciseCode(
	pool: Pool,
	exerciseId: string,
	code: string,
	actorId: string,
): Promise<void> {
	return run(async () => {
		await pool.query('select public.set_exercise_code($1, $2, $3)', [exerciseId, code, actorId]);
	});
}

export async function setStudentAccessCode(
	pool: Pool,
	studentId: string,
	code: string,
	actorId: string,
): Promise<void> {
	return run(async () => {
		await pool.query('select public.set_student_access_code($1, $2, $3)', [
			studentId,
			code,
			actorId,
		]);
	});
}

export async function confirmAssignment(
	pool: Pool,
	studentId: string,
	groupId: string,
	actorId: string,
): Promise<void> {
	return run(async () => {
		await pool.query('select public.confirm_assignment($1, $2, $3)', [
			studentId,
			groupId,
			actorId,
		]);
	});
}

export async function clearAssignment(
	pool: Pool,
	studentId: string,
	actorId: string,
): Promise<void> {
	return run(async () => {
		await pool.query('select public.clear_assignment($1, $2)', [studentId, actorId]);
	});
}

export async function correctAssignment(
	pool: Pool,
	studentId: string,
	groupId: string,
	reason: string,
	actorId: string,
): Promise<void> {
	return run(async () => {
		await pool.query('select public.correct_assignment($1, $2, $3, $4)', [
			studentId,
			groupId,
			reason,
			actorId,
		]);
	});
}

/* ---------------------------------------------------------------------------
 * Funciones públicas (portal y validación de códigos)
 * ------------------------------------------------------------------------- */

interface RpcSubmissionResult {
	status?: string;
	message?: string;
	points?: number;
	group_id?: string;
	exercise_id?: string;
}

const SUBMISSION_STATUSES: SubmissionResult['status'][] = [
	'success',
	'already_solved',
	'wrong_code',
	'invalid_code',
	'invalid_student',
	'inactive_student',
	'inactive_group',
	'no_group',
	'rate_limited',
];

export async function callSubmitExerciseCode(
	pool: Pool,
	studentCode: string,
	exerciseCode: string,
): Promise<SubmissionResult> {
	return run(async () => {
		const { rows } = await pool.query<{ result: RpcSubmissionResult }>(
			'select public.submit_exercise_code($1, $2) as result',
			[studentCode, exerciseCode],
		);
		const raw = rows[0]?.result ?? {};
		const status = SUBMISSION_STATUSES.includes(raw.status as SubmissionResult['status'])
			? (raw.status as SubmissionResult['status'])
			: 'error';
		return {
			status: raw.status ? status : 'error',
			message: raw.message ?? 'No se pudo procesar el envío.',
			points: typeof raw.points === 'number' ? raw.points : 0,
			groupId: raw.group_id,
			exerciseId: raw.exercise_id,
		};
	});
}

export async function callStudentPortal(
	pool: Pool,
	studentCode: string,
): Promise<StudentPortalData> {
	return run(async () => {
		const { rows } = await pool.query<{ result: StudentPortalData }>(
			'select public.student_portal($1) as result',
			[studentCode],
		);
		const result = rows[0]?.result;
		if (!result || result.status !== 'ok') {
			return { status: 'invalid_student', message: result?.message ?? 'El código no es válido.' };
		}
		return result;
	});
}