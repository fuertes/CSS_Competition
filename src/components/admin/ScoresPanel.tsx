'use client';

import { useMemo } from 'react';
import {
	getActiveCompetition,
	listCompetitionScores,
	listExercises,
	listGroupScores,
	listGroups,
	listStudents,
	listSubmissions,
} from '@/lib/data/admin';
import { formatDateTime, formatPoints } from '@/lib/format';
import { rankEntries, type RankingInput } from '@/lib/ranking';
import { ErrorMessage, InfoMessage, Spinner, useAsync } from './AdminUI';

/** Puntuaciones: competición activa, marcador histórico e historial de resoluciones. */
export default function ScoresPanel() {
	const { data, error, loading } = useAsync(async () => {
		const [groups, scores, exercises, students, submissions, competitionScores, activeCompetition] =
			await Promise.all([
				listGroups(),
				listGroupScores(),
				listExercises(),
				listStudents(),
				listSubmissions(),
				listCompetitionScores(),
				getActiveCompetition(),
			]);
		return { groups, scores, exercises, students, submissions, competitionScores, activeCompetition };
	}, []);

	const rankFrom = useMemo(
		() => (scores: { group_id: string; total_points: number; solved_count: number; last_scored_at: string | null }[]) => {
			if (!data) return [];
			const inputs: RankingInput[] = data.groups.map((group) => {
				const score = scores.find((item) => item.group_id === group.id);
				return {
					groupId: group.id,
					name: group.name,
					color: group.color,
					active: group.active,
					totalPoints: score?.total_points ?? 0,
					solvedCount: score?.solved_count ?? 0,
					lastScoredAt: score?.last_scored_at ?? null,
				};
			});
			return rankEntries(inputs);
		},
		[data],
	);

	const activeRanked = useMemo(
		() => (data ? rankFrom(data.competitionScores) : []),
		[data, rankFrom],
	);
	const historicalRanked = useMemo(() => (data ? rankFrom(data.scores) : []), [data, rankFrom]);

	if (loading) return <Spinner />;
	if (!data) return <ErrorMessage>{error ?? 'No se pudieron cargar las puntuaciones.'}</ErrorMessage>;

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-lg font-semibold text-slate-900">Puntuaciones</h2>
				<p className="text-sm text-slate-500">
					Cada competición tiene su propia puntuación: los grupos empiezan a 0 y solo se suman las
					resoluciones de la competición activa. El marcador histórico conserva los resultados de
					competiciones anteriores.
				</p>
			</div>

			<div className="card p-4">
				{data.activeCompetition ? (
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div>
							<h3 className="text-sm font-semibold text-slate-900">
								Competición activa · {data.activeCompetition.exerciseTitle}
							</h3>
							<p className="text-xs text-slate-500">
								Iniciada el {formatDateTime(data.activeCompetition.startedAt)}
							</p>
						</div>
						<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
							En curso
						</span>
					</div>
				) : (
					<InfoMessage>
						No hay ninguna competición activa. Los puntos se registran en su propio ámbito al iniciar
						una ronda; hasta entonces se muestra el marcador histórico acumulado.
					</InfoMessage>
				)}
			</div>

			{data.activeCompetition && (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-slate-900">Clasificación de la competición activa</h3>
					<div className="card overflow-hidden p-0">
						<table className="w-full text-left text-sm">
							<caption className="sr-only">Clasificación de la competición activa</caption>
							<thead>
								<tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase">
									<th scope="col" className="px-4 py-3">Posición</th>
									<th scope="col" className="px-4 py-3">Grupo</th>
									<th scope="col" className="px-4 py-3 text-right">Puntos</th>
									<th scope="col" className="px-4 py-3 text-right">Resueltos</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{activeRanked.map((entry) => (
									<tr key={entry.groupId}>
										<td className="px-4 py-3 font-bold tabular-nums text-slate-700">
											{entry.position}
										</td>
										<td className="px-4 py-3">
											<span className="flex items-center gap-2 font-medium text-slate-800">
												<span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
												{entry.name}
												{!entry.active && <span className="text-xs text-slate-400">(inactivo)</span>}
											</span>
										</td>
										<td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
											{formatPoints(entry.totalPoints)}
										</td>
										<td className="px-4 py-3 text-right tabular-nums text-slate-600">
											{entry.solvedCount}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{activeRanked.length === 0 && (
							<div className="p-4">
								<InfoMessage>No hay grupos todavía.</InfoMessage>
							</div>
						)}
					</div>
				</div>
			)}

			<div>
				<h3 className="mb-2 text-sm font-semibold text-slate-900">
					Marcador histórico acumulado (todas las competiciones)
				</h3>
				<div className="card overflow-hidden p-0">
					<table className="w-full text-left text-sm">
						<caption className="sr-only">Clasificación histórica acumulada de los grupos</caption>
						<thead>
							<tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase">
								<th scope="col" className="px-4 py-3">Posición</th>
								<th scope="col" className="px-4 py-3">Grupo</th>
								<th scope="col" className="px-4 py-3 text-right">Puntos</th>
								<th scope="col" className="px-4 py-3 text-right">Resueltos</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							{historicalRanked.map((entry) => (
								<tr key={entry.groupId}>
									<td className="px-4 py-3 font-bold tabular-nums text-slate-700">
										{entry.position}
									</td>
									<td className="px-4 py-3">
										<span className="flex items-center gap-2 font-medium text-slate-800">
											<span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
											{entry.name}
											{!entry.active && <span className="text-xs text-slate-400">(inactivo)</span>}
										</span>
									</td>
									<td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
										{formatPoints(entry.totalPoints)}
									</td>
									<td className="px-4 py-3 text-right tabular-nums text-slate-600">
										{entry.solvedCount}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{historicalRanked.length === 0 && (
						<div className="p-4">
							<InfoMessage>No hay grupos todavía.</InfoMessage>
						</div>
					)}
				</div>
			</div>

			<div>
				<h3 className="mb-2 text-sm font-semibold text-slate-900">Historial de resoluciones</h3>
				{data.submissions.length === 0 ? (
					<InfoMessage>
						Aún no hay resoluciones. Los puntos se registran automáticamente cuando un alumno envía un
						código correcto.
					</InfoMessage>
				) : (
					<div className="card overflow-x-auto p-0">
						<table className="w-full min-w-[640px] text-left text-sm">
							<caption className="sr-only">Historial de resoluciones</caption>
							<thead>
								<tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase">
									<th scope="col" className="px-4 py-3">Fecha</th>
									<th scope="col" className="px-4 py-3">Ejercicio</th>
									<th scope="col" className="px-4 py-3">Grupo</th>
									<th scope="col" className="px-4 py-3">Alumno</th>
									<th scope="col" className="px-4 py-3 text-right">Puntos</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{data.submissions.map((submission) => (
									<tr key={submission.id}>
										<td className="px-4 py-3 whitespace-nowrap text-slate-500">
											{formatDateTime(submission.submitted_at)}
										</td>
										<td className="px-4 py-3 font-medium text-slate-800">
											{submission.exercise?.title ?? '—'}
										</td>
										<td className="px-4 py-3">
											<span className="flex items-center gap-1.5 text-slate-700">
												{submission.group?.color && (
													<span
														className="h-2.5 w-2.5 rounded-full"
														style={{ backgroundColor: submission.group.color }}
													/>
												)}
												{submission.group?.name ?? '—'}
											</span>
										</td>
										<td className="px-4 py-3 text-slate-600">{submission.student?.name ?? '—'}</td>
										<td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-600">
											+{submission.awarded_points}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}