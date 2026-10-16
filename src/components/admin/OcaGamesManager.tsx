'use client';

import { useMemo, useState, type SubmitEvent } from 'react';
import type { GroupRow, OcaGameRow } from '@/types';
import { createOcaGame, listGroups, listOcaGames } from '@/lib/data/admin';
import { formatDateTime } from '@/lib/format';
import { ErrorMessage, InfoMessage, Spinner, SuccessMessage, useAsync } from './AdminUI';

interface OcaGamesData {
	games: OcaGameRow[];
	groups: GroupRow[];
}

/**
 * Gestión de partidas de La Oca del Caos (panel docente).
 *
 * Permite crear una partida en estado inicial y elegir los grupos que
 * participan. Todavía NO se puede iniciar, finalizar, borrar ni reiniciar una
 * partida, y no se muestran botones para acciones que no existen. Los datos de
 * la competición CSS no se tocan desde aquí.
 */
export default function OcaGamesManager() {
	const { data, error, loading, reload } = useAsync<OcaGamesData>(async () => {
		const [games, groups] = await Promise.all([listOcaGames(), listGroups()]);
		return { games, groups: groups.filter((group) => group.active) };
	}, []);

	const [name, setName] = useState('');
	const [selected, setSelected] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);

	const selectedSet = useMemo(() => new Set(selected), [selected]);

	if (loading) return <Spinner label="Cargando partidas…" />;
	if (!data) return <ErrorMessage>{error ?? 'No se pudieron cargar las partidas.'}</ErrorMessage>;

	const { games, groups } = data;

	function toggleGroup(id: string) {
		setSelected((current) =>
			current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
		);
	}

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setNotice(null);
		setFormError(null);
		try {
			const game = await createOcaGame({ name, groupIds: selected });
			setNotice(
				`Partida «${game.name}» creada con ${game.participants.length} ${
					game.participants.length === 1 ? 'grupo' : 'grupos'
				}.`,
			);
			setName('');
			setSelected([]);
			reload();
		} catch (err) {
			setFormError(err instanceof Error ? err.message : 'No se pudo crear la partida.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-6">
			{notice && <SuccessMessage>{notice}</SuccessMessage>}

			{/* ---------------------------------------------------- Nueva partida */}
			<section className="card">
				<header className="border-b border-slate-100 px-5 py-4">
					<h2 className="text-base font-semibold text-slate-900">Nueva partida</h2>
					<p className="mt-0.5 text-sm text-slate-500">
						Pon un nombre y elige los grupos que participarán. La partida se crea sin iniciar.
					</p>
				</header>

				<div className="p-5">
					{groups.length === 0 ? (
						<InfoMessage>
							No hay grupos activos. Crea o activa grupos en la sección «Grupos» antes de crear
							una partida.
						</InfoMessage>
					) : (
						<form className="space-y-5" onSubmit={handleSubmit}>
							<div>
								<label htmlFor="oca-game-name" className="label">
									Nombre de la partida
								</label>
								<input
									id="oca-game-name"
									className="input"
									type="text"
									value={name}
									onChange={(event) => setName(event.target.value)}
									placeholder="Jornada 1 · La Oca del Caos"
									maxLength={80}
									required
								/>
							</div>

							<fieldset>
								<legend className="label">Grupos participantes ({selected.length})</legend>
								<div className="mt-2 grid gap-2 sm:grid-cols-2">
									{groups.map((group) => (
										<label
											key={group.id}
											className={[
												'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition',
												selectedSet.has(group.id)
													? 'border-brand-300 bg-brand-50 text-slate-900'
													: 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
											].join(' ')}
										>
											<input
												type="checkbox"
												className="h-4 w-4 accent-brand-600"
												checked={selectedSet.has(group.id)}
												onChange={() => toggleGroup(group.id)}
											/>
											<span
												className="h-3 w-3 shrink-0 rounded-full"
												style={{ backgroundColor: group.color }}
												aria-hidden="true"
											/>
											<span className="truncate font-medium">{group.name}</span>
										</label>
									))}
								</div>
							</fieldset>

							{formError && <ErrorMessage>{formError}</ErrorMessage>}

							<div className="flex justify-end">
								<button
									type="submit"
									className="btn-primary"
									disabled={busy || name.trim() === '' || selected.length === 0}
								>
									{busy ? 'Creando…' : 'Crear partida'}
								</button>
							</div>
						</form>
					)}
				</div>
			</section>

			{/* ------------------------------------------------- Partidas creadas */}
			<section className="card">
				<header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
					<div>
						<h2 className="text-base font-semibold text-slate-900">Partidas creadas</h2>
						<p className="mt-0.5 text-sm text-slate-500">
							{games.length === 0
								? 'Todavía no hay partidas.'
								: `${games.length} ${games.length === 1 ? 'partida' : 'partidas'} en estado inicial.`}
						</p>
					</div>
					<button type="button" className="btn-secondary" onClick={reload}>
						Actualizar
					</button>
				</header>

				<div className="divide-y divide-slate-100">
					{games.length === 0 ? (
						<p className="px-5 py-8 text-center text-sm text-slate-500">
							Crea la primera partida con el formulario de arriba.
						</p>
					) : (
						games.map((game) => (
							<article key={game.id} className="px-5 py-4">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<div className="flex items-center gap-2">
										<h3 className="text-sm font-semibold text-slate-900">{game.name}</h3>
										<span className="badge border border-slate-200 bg-slate-50 text-slate-600">
											Creada
										</span>
									</div>
									<span className="text-xs text-slate-400">
										{formatDateTime(game.created_at)}
									</span>
								</div>
								<div className="mt-2 flex flex-wrap gap-2">
									{game.participants.map((participant) => (
										<span
											key={participant.id}
											className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700"
										>
											<span
												className="h-2.5 w-2.5 rounded-full"
												style={{ backgroundColor: participant.color }}
												aria-hidden="true"
											/>
											{participant.name}
										</span>
									))}
								</div>
							</article>
						))
					)}
				</div>
			</section>
		</div>
	);
}
