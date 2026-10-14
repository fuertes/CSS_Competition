'use client';

import { useState } from 'react';
import type { CompetitionRoundAdmin } from '@/types';
import { deleteCompetitionRound, listCompetitionRounds } from '@/lib/data/admin';
import { formatDateTime, formatPoints } from '@/lib/format';
import { ConfirmButton, ErrorMessage, InfoMessage, Spinner, SuccessMessage, useAsync } from './AdminUI';

/**
 * Lista de competiciones (ejecuciones) con la opción de eliminarlas.
 *
 * Eliminar una competición borra de verdad sus datos (participantes, intentos,
 * puntuaciones y penalizaciones) pero conserva los grupos, sus códigos de
 * acceso y el ejercicio compartido. El borrado ocurre en el servidor dentro de
 * una transacción; aquí solo se pide confirmación y se refresca la lista.
 */
export default function CompetitionsManager() {
	const { data: rounds, error, loading, reload } = useAsync(listCompetitionRounds, []);

	const [notice, setNotice] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	function describe(round: CompetitionRoundAdmin): string {
		const state = round.status === 'open' ? 'en curso' : 'finalizada';
		const parts = [
			`Competición «${round.exerciseTitle}» (${state}, iniciada el ${formatDateTime(round.startedAt)}).`,
			'Se eliminarán sus participantes, intentos, puntuaciones y penalizaciones.',
			'Los grupos, sus códigos de acceso y el ejercicio se conservan.',
		];
		if (round.status === 'open') {
			parts.push('¡Está en curso!: se cancelará y se cerrará. No se puede deshacer.');
		} else {
			parts.push('Esta acción no se puede deshacer.');
		}
		return parts.join(' ');
	}

	async function handleDelete(round: CompetitionRoundAdmin) {
		setNotice(null);
		setActionError(null);
		try {
			const result = await deleteCompetitionRound(round.id);
			setNotice(
				`Competición «${result.exerciseTitle}» eliminada (${result.participants} ${
					result.participants === 1 ? 'participante' : 'participantes'
				}, ${result.scoringEvents} ${
					result.scoringEvents === 1 ? 'evento de puntuación' : 'eventos de puntuación'
				}).`,
			);
			reload();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : 'No se pudo eliminar la competición.');
		}
	}

	if (loading) return <Spinner />;
	if (!rounds) return <ErrorMessage>{error ?? 'No se pudieron cargar las competiciones.'}</ErrorMessage>;

	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-lg font-semibold text-slate-900">Competiciones</h2>
				<p className="text-sm text-slate-500">
					Cada competición es una ejecución con su propia puntuación, independiente de las
					demás. Eliminar una competición borra sus datos, pero conserva los grupos, sus
					códigos de acceso y el ejercicio.
				</p>
			</div>

			{notice && <SuccessMessage>{notice}</SuccessMessage>}
			{actionError && <ErrorMessage>{actionError}</ErrorMessage>}

			{rounds.length === 0 ? (
				<div className="card">
					<InfoMessage>Todavía no se ha iniciado ninguna competición.</InfoMessage>
				</div>
			) : (
				<div className="card overflow-hidden p-0">
					<ul className="divide-y divide-slate-100">
						{rounds.map((round) => (
							<li key={round.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
								<div className="min-w-0 flex-1">
									<p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
										<span className="truncate">{round.exerciseTitle}</span>
										<span
											className={[
												'rounded-full px-2 py-0.5 text-[11px] font-semibold',
												round.status === 'open'
													? 'bg-emerald-100 text-emerald-700'
													: 'bg-slate-100 text-slate-600',
											].join(' ')}
										>
											{round.status === 'open' ? 'En curso' : 'Finalizada'}
										</span>
									</p>
									<p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
										<span>Inicio: {formatDateTime(round.startedAt)}</span>
										<span>Fin: {round.status === 'open' ? 'en curso' : formatDateTime(round.endedAt)}</span>
										<span>· {formatPoints(round.participantCount)} participantes</span>
										<span>· {formatPoints(round.scoringEventCount)} eventos</span>
										<span>· {formatPoints(round.propertyScoreCount)} propiedades</span>
									</p>
								</div>
								<ConfirmButton
									label="Eliminar competición"
									description={describe(round)}
									confirmLabel="Eliminar"
									onConfirm={() => handleDelete(round)}
								/>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
