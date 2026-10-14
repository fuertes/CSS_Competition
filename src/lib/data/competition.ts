import 'server-only';
import type { Pool } from 'pg';
import type {
	CompetitionRoundAdmin,
	CompetitionState,
	CompetitionSubmitResult,
	CssExerciseAdmin,
	CssRuleAdmin,
	CssSelectorAdmin,
	DeletedCompetitionRound,
	GroupAccessCode,
	SelectorStatus,
} from '@/types';
import { run, toIso, fetchRankingRows, withTransaction } from '@/lib/data/postgres';
import { encryptAccessCode, decryptAccessCode, isAccessCodeEncryptionConfigured } from '@/lib/crypto/access-code';
import { rankEntries } from '@/lib/ranking';
import { canonicalizeValue } from '@/lib/css/validator';
import type { NormalizedSelector } from '@/lib/css/importer';
import { GROUP_SESSION_TTL_SECONDS } from '@/lib/auth/group-session';

/**
 * Capa de datos de la competición CSS (solo servidor).
 *
 * El parseo del CSS se hace en este proceso (PostCSS); la puntuación ocurre
 * dentro de una función SQL transaccional que es la fuente de verdad y la
 * última defensa contra entregas simultáneas.
 */

export interface GroupLoginResult {
	status: 'ok' | 'invalid' | 'inactive' | 'rate_limited';
	message?: string;
	group?: { id: string; name: string; color: string };
}

/** Autentica a un grupo por código y crea su sesión (todo en la BD). */
export async function groupLogin(
	pool: Pool,
	code: string,
	tokenHash: string,
): Promise<GroupLoginResult> {
	return run(async () => {
		const { rows } = await pool.query<{ result: GroupLoginResult }>(
			'select public.group_login($1, $2, $3) as result',
			[code, tokenHash, GROUP_SESSION_TTL_SECONDS],
		);
		return rows[0]!.result;
	});
}

/**
 * Genera (o regenera) el código de acceso de un grupo; solo admins.
 *
 * El código en claro se devuelve para entregarlo al grupo. En la base de datos
 * se guardan el lookup (HMAC) y el hash (bcrypt) para verificar el acceso, y
 * además el código cifrado (AES-256-GCM) para poder volver a mostrarlo en el
 * panel. La generación, el hash y el cifrado ocurren en una única transacción:
 * si el cifrado no está configurado o falla, no queda un código a medias.
 */
export async function generateGroupAccessCode(
	pool: Pool,
	groupId: string,
	actorId: string,
): Promise<string> {
	return withTransaction(pool, async (client) => {
		const { rows } = await client.query<{ code: string }>(
			'select public.generate_group_access_code($1, $2) as code',
			[groupId, actorId],
		);
		const code = rows[0]!.code;

		// Si la clave de cifrado no está configurada, el código se genera y se
		// verifica igual que antes, pero no puede volver a mostrarse (compatible
		// con instalaciones existentes). Con la clave, queda recuperable.
		if (isAccessCodeEncryptionConfigured()) {
			await client.query(
				'update public.groups set access_code_encrypted = $2 where id = $1',
				[groupId, encryptAccessCode(code)],
			);
		}

		return code;
	});
}

/**
 * Código de acceso completo de cada grupo para el panel. Descifra el valor
 * almacenado; si no existe o no puede descifrarse (código anterior a la
 * recuperación), devuelve `code: null` sin inventar ningún valor.
 */
export async function listGroupAccessCodes(pool: Pool): Promise<GroupAccessCode[]> {
	return run(async () => {
		const { rows } = await pool.query<{
			id: string;
			has_access_code: boolean;
			access_code_encrypted: string | null;
		}>(
			`select id,
					(access_code_hash is not null) as has_access_code,
					access_code_encrypted
			 from public.groups
			 order by name asc`,
		);
		return rows.map((row) => ({
			groupId: row.id,
			hasAccessCode: row.has_access_code,
			code: row.has_access_code ? decryptAccessCode(row.access_code_encrypted) : null,
		}));
	});
}

export interface CssDeclaration {
	property: string;
	value: string;
}

/** Entrega evaluada de un selector; la puntuación ocurre en la transacción SQL. */
export async function submitCssSelector(
	pool: Pool,
	groupId: string,
	selectorId: string,
	declarations: CssDeclaration[],
	requestId?: string | null,
): Promise<CompetitionSubmitResult> {
	return run(async () => {
		const { rows } = await pool.query<{ result: CompetitionSubmitResult }>(
			'select public.submit_css_selector($1, $2, $3, $4) as result',
			[groupId, selectorId, JSON.stringify(declarations), requestId ?? null],
		);
		return rows[0]!.result;
	});
}

/**
 * Registra un intento rechazado antes de la evaluación (error sintáctico,
 * selector incorrecto, etc.). El motivo es interno; nunca se expone al cliente.
 */
export async function recordRejectedAttempt(
	pool: Pool,
	groupId: string,
	selectorId: string,
	reason: string,
): Promise<void> {
	return run(async () => {
		await pool.query(
			`insert into public.group_attempts (group_id, selector_id, round_id, success, awarded_points, reason)
			 values (
				$1,
				$2,
				(select id from public.competition_rounds where ended_at is null order by started_at desc limit 1),
				false,
				0,
				$3
			 )`,
			[groupId, selectorId, reason],
		);
	});
}

/** Selector por id (solo el texto autorizado, para el validador del servidor). */
export async function getCssSelectorById(
	pool: Pool,
	selectorId: string,
): Promise<{ id: string; selector: string; exercise_id: string } | null> {
	return run(async () => {
		const { rows } = await pool.query<{ id: string; selector: string; exercise_id: string }>(
			`select id, selector, exercise_id
			 from public.exercise_selectors
			 where id = $1 and active = true`,
			[selectorId],
		);
		return rows[0] ?? null;
	});
}

/**
 * Estado público de la competición para un grupo autenticado: ejercicio de la
 * ronda activa, todos los selectores con su estado agregado y clasificación.
 *
 * Nunca contiene soluciones, valores esperados ni hashes de acceso. El estado
 * de cada selector es agregado (pendiente / en progreso / completado) y no
 * revela cuántas propiedades tiene la solución ni cuáles son correctas.
 */

/** Estado de un selector a partir de reglas totales y propiedades resueltas. */
function selectorStatus(totalRules: number, scored: number): SelectorStatus {
	// Un selector sin reglas no tiene nada que resolver: no bloquea el ejercicio.
	if (totalRules === 0) return 'completed';
	if (scored <= 0) return 'pending';
	if (scored >= totalRules) return 'completed';
	return 'in_progress';
}

export async function getCompetitionState(
	pool: Pool,
	groupId: string,
): Promise<CompetitionState> {
	return run(async () => {
		const groupRows = await pool.query<{
			id: string;
			name: string;
			color: string;
			active: boolean;
			total_points: number;
		}>(
			`select g.id, g.name, g.color, g.active,
					coalesce(gs.total_points, 0) as total_points
			 from public.groups g
			 left join public.group_scores gs on gs.group_id = g.id
			 where g.id = $1`,
			[groupId],
		);
		const group = groupRows.rows[0];
		if (!group) {
			return { status: 'inactive_group', message: 'El grupo no existe.', group: {
				id: groupId, name: 'Grupo', color: '#64748b',
			}, selectors: [], progress: { completed: 0, total: 0 }, allSelectorsDone: false, totalPoints: 0, ranking: [] };
		}
		const baseGroup = { id: group.id, name: group.name, color: group.color };

		const roundRows = await pool.query<{
			round_id: string;
			exercise_id: string;
			title: string;
			description: string | null;
		}>(
			`select r.id as round_id, e.id as exercise_id, e.title, e.description
			 from public.competition_rounds r
			 join public.exercises e on e.id = r.exercise_id
			 where r.ended_at is null and e.kind = 'css'
			 order by r.started_at desc
			 limit 1`,
		);
		const round = roundRows.rows[0];
		if (!round) {
			return {
				status: 'no_round',
				message: 'Todavía no hay competición activa.',
				group: baseGroup,
				selectors: [],
				progress: { completed: 0, total: 0 },
				allSelectorsDone: false,
				totalPoints: group.total_points,
				position: undefined,
				ranking: await getRanking(pool),
			};
		}

		if (!group.active) {
			return {
				status: 'inactive_group',
				message: 'El grupo no puede participar por ahora.',
				group: baseGroup,
				exercise: { id: round.exercise_id, title: round.title, description: round.description },
				selectors: [],
				progress: { completed: 0, total: 0 },
				allSelectorsDone: false,
				totalPoints: group.total_points,
				ranking: await getRanking(pool),
			};
		}

		// Participación explícita: el grupo debe pertenecer a ESTA competición
		// (roster fijado al iniciarla). No se acepta ningún identificador de
		// competición desde el cliente; aquí se resuelve en el servidor.
		const participation = await pool.query(
			'select 1 from public.competition_participants where round_id = $1 and group_id = $2',
			[round.round_id, groupId],
		);
		if ((participation.rowCount ?? 0) === 0) {
			return {
				status: 'not_participating',
				message: 'Tu grupo no participa en esta competición.',
				group: baseGroup,
				exercise: { id: round.exercise_id, title: round.title, description: round.description },
				selectors: [],
				progress: { completed: 0, total: 0 },
				allSelectorsDone: false,
				totalPoints: 0,
				ranking: await getRanking(pool),
			};
		}

		// Todos los selectores activos con su estado agregado. El recuento de
		// propiedades se calcula en el servidor y no se expone: solo el estado.
		const selectorRows = await pool.query<{
			id: string;
			selector: string;
			total_rules: number;
			scored: number;
		}>(
			`select s.id, s.selector,
					(select count(*)::int from public.selector_rules r
					 where r.selector_id = s.id) as total_rules,
					(select count(*)::int from public.selector_rules r
					 where r.selector_id = s.id
					   and exists (
						 select 1 from public.group_property_scores gps
						 where gps.group_id = $2
						   and gps.round_id = $3
						   and gps.exercise_id = $1
						   and gps.selector_id = s.id
						   and gps.property_name = r.property_name
					   )) as scored
			 from public.exercise_selectors s
			 where s.exercise_id = $1 and s.active = true
			 order by s.position asc, s.created_at asc`,
			[round.exercise_id, groupId, round.round_id],
		);

		const selectors = selectorRows.rows.map((row) => ({
			id: row.id,
			selector: row.selector,
			status: selectorStatus(row.total_rules, row.scored),
		}));
		const completed = selectors.filter((selector) => selector.status === 'completed').length;

		// Marcador de la competición activa: SOLO los eventos de esta ronda. No se
		// mezclan puntuaciones de competiciones anteriores.
		const roundPoints = await pool.query<{ total: number }>(
			`select coalesce(sum(points), 0)::int as total
			 from public.scoring_events
			 where group_id = $1 and round_id = $2`,
			[groupId, round.round_id],
		);
		const competitionPoints = roundPoints.rows[0]?.total ?? 0;

		const ranking = await getRanking(pool);
		const position = ranking.find((entry) => entry.groupId === groupId)?.position;

		return {
			status: 'ok',
			group: baseGroup,
			exercise: { id: round.exercise_id, title: round.title, description: round.description },
			selectors,
			progress: { completed, total: selectors.length },
			allSelectorsDone: selectors.every((selector) => selector.status === 'completed'),
			totalPoints: competitionPoints,
			position,
			ranking,
		};
	});
}

/** Clasificación agregada (misma base que el ranking público), ordenada. */
export async function getRanking(pool: Pool): Promise<CompetitionState['ranking']> {
	return run(async () => {
		const rows = await fetchRankingRows(pool);
		const entries = rows.map((row) => ({
			groupId: row.group_id,
			name: row.name,
			color: row.color,
			active: row.active,
			totalPoints: row.total_points,
			solvedCount: row.solved_count,
			lastScoredAt: row.last_scored_at,
		}));
		return rankEntries(entries);
	});
}

// ---------------------------------------------------------------------------
// Administración (ejercicios CSS, selectores, reglas y rondas)
// ---------------------------------------------------------------------------

interface CssExerciseDbRow {
	id: string;
	title: string;
	description: string | null;
	active: boolean;
	archived: boolean;
	created_at: Date;
	updated_at: Date;
	selector_count: number;
	round_id: string | null;
	round_started_at: Date | null;
}

export async function listCssExercises(pool: Pool): Promise<CssExerciseAdmin[]> {
	return run(async () => {
		const { rows } = await pool.query<CssExerciseDbRow>(
			`select e.id, e.title, e.description, e.active, e.archived,
					e.created_at, e.updated_at,
					(select count(*)::int from public.exercise_selectors s
					 where s.exercise_id = e.id and s.active) as selector_count,
					r.id as round_id, r.started_at as round_started_at
			 from public.exercises e
			 left join public.competition_rounds r
				on r.exercise_id = e.id and r.ended_at is null
			 where e.kind = 'css'
			 order by e.created_at desc`,
		);
		return rows.map((row) => ({
			id: row.id,
			title: row.title,
			description: row.description,
			active: row.active,
			archived: row.archived,
			created_at: toIso(row.created_at)!,
			updated_at: toIso(row.updated_at)!,
			selector_count: row.selector_count,
			round: row.round_id
				? { id: row.round_id, exerciseId: row.id, startedAt: toIso(row.round_started_at)! }
				: null,
		}));
	});
}

export async function createCssExercise(
	pool: Pool,
	input: { title: string; description: string | null },
): Promise<string> {
	return run(async () => {
		const { rows } = await pool.query<{ id: string }>(
			`insert into public.exercises (title, description, kind)
			 values ($1, $2, 'css')
			 returning id`,
			[input.title, input.description],
		);
		return rows[0]!.id;
	});
}

export async function deleteCssExercise(pool: Pool, id: string): Promise<void> {
	return run(async () => {
		await pool.query('delete from public.exercises where id = $1 and kind = $2', [id, 'css']);
	});
}

interface CssSelectorDbRow {
	id: string;
	exercise_id: string;
	selector: string;
	position: number;
	active: boolean;
}

interface CssRuleDbRow {
	id: string;
	selector_id: string;
	property_name: string;
	expected_canonical: string;
	points: number;
}

export async function listCssSelectors(
	pool: Pool,
	exerciseId: string,
): Promise<CssSelectorAdmin[]> {
	return run(async () => {
		const { rows: selectors } = await pool.query<CssSelectorDbRow>(
			`select id, exercise_id, selector, position, active
			 from public.exercise_selectors
			 where exercise_id = $1
			 order by position asc, created_at asc`,
			[exerciseId],
		);
		if (selectors.length === 0) return [];

		const { rows: rules } = await pool.query<CssRuleDbRow>(
			`select id, selector_id, property_name, expected_canonical, points
			 from public.selector_rules
			 where selector_id = any($1::uuid[])
			 order by property_name asc`,
			[selectors.map((s) => s.id)],
		);

		const rulesBySelector = new Map<string, CssRuleAdmin[]>();
		for (const rule of rules) {
			const list = rulesBySelector.get(rule.selector_id) ?? [];
			list.push({
				id: rule.id,
				selector_id: rule.selector_id,
				property_name: rule.property_name,
				expected_value: rule.expected_canonical,
				points: rule.points,
			});
			rulesBySelector.set(rule.selector_id, list);
		}

		return selectors.map((selector) => ({
			id: selector.id,
			exercise_id: selector.exercise_id,
			selector: selector.selector,
			position: selector.position,
			active: selector.active,
			rules: rulesBySelector.get(selector.id) ?? [],
		}));
	});
}

export async function createCssSelector(
	pool: Pool,
	input: { exerciseId: string; selector: string },
): Promise<CssSelectorAdmin> {
	return run(async () => {
		const { rows } = await pool.query<CssSelectorDbRow>(
			`insert into public.exercise_selectors (exercise_id, selector, position)
			 values (
				$1,
				$2,
				coalesce((select max(position) + 1 from public.exercise_selectors where exercise_id = $1), 0)
			 )
			 returning id, exercise_id, selector, position, active`,
			[input.exerciseId, input.selector],
		);
		const row = rows[0]!;
		return {
			id: row.id,
			exercise_id: row.exercise_id,
			selector: row.selector,
			position: row.position,
			active: row.active,
			rules: [],
		};
	});
}

export async function updateCssSelector(
	pool: Pool,
	id: string,
	input: { selector?: string; active?: boolean },
): Promise<void> {
	return run(async () => {
		await pool.query(
			`update public.exercise_selectors
			 set selector = coalesce($2, selector),
				 active = coalesce($3, active)
			 where id = $1`,
			[id, input.selector ?? null, input.active ?? null],
		);
	});
}

export async function deleteCssSelector(pool: Pool, id: string): Promise<void> {
	return run(async () => {
		await pool.query('delete from public.exercise_selectors where id = $1', [id]);
	});
}

function toRule(row: CssRuleDbRow): CssRuleAdmin {
	return {
		id: row.id,
		selector_id: row.selector_id,
		property_name: row.property_name,
		expected_value: row.expected_canonical,
		points: row.points,
	};
}

export async function createCssRule(
	pool: Pool,
	input: { selectorId: string; property: string; expectedValue: string; points: number },
): Promise<CssRuleAdmin> {
	return run(async () => {
		const { rows } = await pool.query<CssRuleDbRow>(
			`insert into public.selector_rules (selector_id, property_name, expected_canonical, points)
			 values ($1, lower(trim($2)), $3, $4)
			 returning id, selector_id, property_name, expected_canonical, points`,
			[input.selectorId, input.property, canonicalizeValue(input.expectedValue), input.points],
		);
		return toRule(rows[0]!);
	});
}

export async function updateCssRule(
	pool: Pool,
	id: string,
	input: { property?: string; expectedValue?: string; points?: number },
): Promise<void> {
	return run(async () => {
		const columns: Array<[string, unknown]> = [];
		if (input.property !== undefined) columns.push(['property_name', input.property.trim().toLowerCase()]);
		if (input.expectedValue !== undefined) {
			columns.push(['expected_canonical', canonicalizeValue(input.expectedValue)]);
		}
		if (input.points !== undefined) columns.push(['points', input.points]);
		if (columns.length === 0) return;

		const sets = columns.map(([column], index) => `${column} = $${index + 2}`);
		const values = columns.map(([, value]) => value);
		await pool.query(
			`update public.selector_rules set ${sets.join(', ')} where id = $1`,
			[id, ...values],
		);
	});
}

export async function deleteCssRule(pool: Pool, id: string): Promise<void> {
	return run(async () => {
		await pool.query('delete from public.selector_rules where id = $1', [id]);
	});
}

export async function startCompetitionRound(
	pool: Pool,
	exerciseId: string,
	actorId: string,
): Promise<string> {
	return run(async () => {
		const { rows } = await pool.query<{ result: { id: string } }>(
			'select public.start_competition_round($1, $2) as result',
			[exerciseId, actorId],
		);
		return rows[0]!.result.id;
	});
}

export async function endCompetitionRound(pool: Pool, actorId: string): Promise<string> {
	return run(async () => {
		const { rows } = await pool.query<{ result: { id: string } }>(
			'select public.end_competition_round($1) as result',
			[actorId],
		);
		return rows[0]!.result.id;
	});
}

interface CompetitionRoundDbRow {
	id: string;
	exercise_id: string;
	exercise_title: string;
	started_at: Date;
	ended_at: Date | null;
	participant_count: number;
	scoring_event_count: number;
	property_score_count: number;
}

/**
 * Lista todas las competiciones (ejecuciones) registradas, de más reciente a
 * más antigua, con el nombre del ejercicio y un resumen de datos para poder
 * eliminarlas con conocimiento de causa.
 */
export async function listCompetitionRounds(pool: Pool): Promise<CompetitionRoundAdmin[]> {
	return run(async () => {
		const { rows } = await pool.query<CompetitionRoundDbRow>(
			`select r.id, r.exercise_id, e.title as exercise_title,
					r.started_at, r.ended_at,
					(select count(*)::int from public.competition_participants p
					 where p.round_id = r.id) as participant_count,
					(select count(*)::int from public.scoring_events se
					 where se.round_id = r.id) as scoring_event_count,
					(select count(*)::int from public.group_property_scores gps
					 where gps.round_id = r.id) as property_score_count
			 from public.competition_rounds r
			 join public.exercises e on e.id = r.exercise_id
			 order by r.started_at desc`,
		);
		return rows.map((row) => ({
			id: row.id,
			exerciseId: row.exercise_id,
			exerciseTitle: row.exercise_title,
			startedAt: toIso(row.started_at)!,
			endedAt: toIso(row.ended_at),
			status: row.ended_at ? 'ended' : 'open',
			participantCount: row.participant_count,
			scoringEventCount: row.scoring_event_count,
			propertyScoreCount: row.property_score_count,
		}));
	});
}

/**
 * Elimina de verdad una competición (ejecución) y todos sus datos dependientes,
 * conservando grupos, códigos de acceso y el ejercicio compartido. El borrado y
 * el recálculo de marcadores ocurren en la función SQL transaccional.
 */
export async function deleteCompetitionRound(
	pool: Pool,
	roundId: string,
	actorId: string,
): Promise<DeletedCompetitionRound> {
	return run(async () => {
		const { rows } = await pool.query<{ result: DeletedCompetitionRound }>(
			'select public.delete_competition_round($1, $2) as result',
			[roundId, actorId],
		);
		return rows[0]!.result;
	});
}

/* ---------------------------------------------------------------------------
 * Importación de CSS de referencia.
 * ------------------------------------------------------------------------- */

export interface CssImportSaveInput {
	/** Ejercicio a reemplazar; `null` para crear uno nuevo. */
	exerciseId: string | null;
	title: string;
	description: string | null;
	selectors: NormalizedSelector[];
}

export interface CssImportSaveResult {
	exerciseId: string;
	selectorCount: number;
	ruleCount: number;
}

interface ExerciseHistoryRow {
	has_events: boolean;
	has_scores: boolean;
	has_round: boolean;
}

/**
 * Guarda (en una única transacción) un ejercicio CSS a partir de selectores y
 * reglas ya normalizadas en el servidor.
 *
 * Política segura de edición: si el ejercicio ya tiene historial de puntuación
 * o una ronda activa, se rechaza el reemplazo de selectores en lugar de
 * sobrescribir reglas silenciosamente o borrar su historial. En ese caso el
 * profesor debe crear un ejercicio nuevo (o archivar el actual).
 */
export async function saveCssImport(
	pool: Pool,
	input: CssImportSaveInput,
): Promise<CssImportSaveResult> {
	return withTransaction(pool, async (client) => {
		let exerciseId = input.exerciseId;

		if (!exerciseId) {
			const { rows } = await client.query<{ id: string }>(
				`insert into public.exercises (title, description, kind)
				 values ($1, $2, 'css')
				 returning id`,
				[input.title, input.description],
			);
			exerciseId = rows[0]!.id;
		} else {
			const existing = await client.query<{ id: string }>(
				`select id from public.exercises where id = $1 and kind = 'css' for update`,
				[exerciseId],
			);
			if (existing.rowCount === 0) {
				throw new Error('El ejercicio CSS no existe.');
			}

			const history = await client.query<ExerciseHistoryRow>(
				`select
					exists(select 1 from public.scoring_events where exercise_id = $1) as has_events,
					exists(select 1 from public.group_property_scores where exercise_id = $1) as has_scores,
					exists(select 1 from public.competition_rounds
						where exercise_id = $1 and ended_at is null) as has_round`,
				[exerciseId],
			);
			const state = history.rows[0]!;
			if (state.has_round) {
				throw new Error(
					'No se pueden reemplazar los selectores mientras la ronda está activa. Ciérrala primero.',
				);
			}
			if (state.has_events || state.has_scores) {
				throw new Error(
					'Este ejercicio ya tiene puntuaciones registradas. Crea un ejercicio nuevo para no alterar el historial.',
				);
			}

			await client.query(
				`update public.exercises
				 set title = $2, description = $3, updated_at = now()
				 where id = $1`,
				[exerciseId, input.title, input.description],
			);
			// Las reglas caen en cascada con sus selectores.
			await client.query('delete from public.exercise_selectors where exercise_id = $1', [
				exerciseId,
			]);
		}

		let position = 0;
		let ruleCount = 0;
		for (const selector of input.selectors) {
			const { rows } = await client.query<{ id: string }>(
				`insert into public.exercise_selectors (exercise_id, selector, position)
				 values ($1, $2, $3)
				 returning id`,
				[exerciseId, selector.selector, position],
			);
			const selectorId = rows[0]!.id;
			position += 1;
			for (const rule of selector.rules) {
				await client.query(
					`insert into public.selector_rules
						(selector_id, property_name, expected_canonical, points)
					 values ($1, $2, $3, $4)`,
					[selectorId, rule.property, rule.expectedCanonical, rule.points],
				);
				ruleCount += 1;
			}
		}

		return { exerciseId, selectorCount: input.selectors.length, ruleCount };
	});
}