import 'server-only';
import type { Pool } from 'pg';
import type { PurgePreview, PurgeResult, PurgeScope } from '@/types';
import { run } from '@/lib/data/postgres';

/**
 * Capa de datos del mantenimiento masivo (solo servidor).
 *
 * La fuente de verdad es la función SQL transaccional `purge_entities`
 * (migración 0014): valida al administrador, la frase de confirmación y las
 * dependencias, y devuelve los recuentos reales. Aquí solo se lee la vista
 * previa y se invoca la función.
 */

interface PurgePreviewDbRow {
	groups: number;
	students: number;
	submissions: number;
	scoring_events: number;
	property_scores: number;
	group_attempts: number;
	participants: number;
	group_sessions: number;
	rounds: number;
	exercises: number;
}

/** Recuento (calculado en la base de datos) de lo que afectaría una purga. */
export async function getPurgePreview(pool: Pool): Promise<PurgePreview> {
	return run(async () => {
		const { rows } = await pool.query<PurgePreviewDbRow>(
			`select
				(select count(*)::int from public.groups) as groups,
				(select count(*)::int from public.students) as students,
				(select count(*)::int from public.submissions) as submissions,
				(select count(*)::int from public.scoring_events) as scoring_events,
				(select count(*)::int from public.group_property_scores) as property_scores,
				(select count(*)::int from public.group_attempts) as group_attempts,
				(select count(*)::int from public.competition_participants) as participants,
				(select count(*)::int from public.group_sessions) as group_sessions,
				(select count(*)::int from public.competition_rounds) as rounds,
				(select count(*)::int from public.exercises) as exercises`,
		);
		const row = rows[0]!;
		return {
			groups: row.groups,
			students: row.students,
			submissions: row.submissions,
			scoringEvents: row.scoring_events,
			propertyScores: row.property_scores,
			groupAttempts: row.group_attempts,
			participants: row.participants,
			groupSessions: row.group_sessions,
			rounds: row.rounds,
			exercises: row.exercises,
		};
	});
}

/**
 * Ejecuta una purga masiva. El ámbito y la frase de confirmación se validan en
 * la función SQL; los recuentos devueltos son los reales de la base de datos.
 */
export async function purgeEntities(
	pool: Pool,
	scope: PurgeScope,
	confirmation: string,
	actorId: string,
): Promise<PurgeResult> {
	return run(async () => {
		const { rows } = await pool.query<{ result: PurgeResult }>(
			'select public.purge_entities($1, $2, $3) as result',
			[scope, confirmation, actorId],
		);
		return rows[0]!.result;
	});
}
