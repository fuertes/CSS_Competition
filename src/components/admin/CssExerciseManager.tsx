'use client';

import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import type { CssExerciseAdmin, CssSelectorAdmin } from '@/types';
import {
	createCssExercise,
	createCssRule,
	createCssSelector,
	deleteCssExercise,
	deleteCssRule,
	deleteCssSelector,
	endCompetitionRound,
	listCssExercises,
	listCssSelectors,
	startCompetitionRound,
	updateCssExercise,
} from '@/lib/data/admin';
import { ConfirmButton, ErrorMessage, InfoMessage, Spinner, SuccessMessage, useAsync } from './AdminUI';

interface ExerciseForm {
	title: string;
	description: string;
}

const EMPTY_FORM: ExerciseForm = { title: '', description: '' };

/** Gestión de ejercicios CSS: selectores, reglas privadas y rondas. */
export default function CssExerciseManager() {
	const { data: exercises, error, loading, reload } = useAsync(listCssExercises, []);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectors, setSelectors] = useState<CssSelectorAdmin[]>([]);
	const [selectorsLoading, setSelectorsLoading] = useState(false);

	const [form, setForm] = useState<ExerciseForm>(EMPTY_FORM);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const selected = (exercises ?? []).find((exercise) => exercise.id === selectedId) ?? null;

	const loadSelectors = useCallback(async (exerciseId: string) => {
		setSelectorsLoading(true);
		try {
			setSelectors(await listCssSelectors(exerciseId));
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudieron cargar los selectores.');
		} finally {
			setSelectorsLoading(false);
		}
	}, []);

	useEffect(() => {
		// Carga los selectores al cambiar de ejercicio (fetch-on-change deliberado).
		// eslint-disable-next-line react-hooks/set-state-in-effect
		if (selectedId) void loadSelectors(selectedId);
	}, [selectedId, loadSelectors]);

	async function refreshAll(exerciseId?: string | null) {
		reload();
		const id = exerciseId ?? selectedId;
		if (id) await loadSelectors(id);
	}

	async function handleCreateExercise(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setNotice(null);
		setErrorMessage(null);
		try {
			const id = await createCssExercise({
				title: form.title,
				description: form.description.trim() ? form.description.trim() : null,
			});
			setForm(EMPTY_FORM);
			setNotice('Ejercicio CSS creado. Añade ahora sus selectores y reglas.');
			setSelectedId(id);
			reload();
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo crear el ejercicio.');
		} finally {
			setBusy(false);
		}
	}

	async function toggleActive(exercise: CssExerciseAdmin) {
		await updateCssExercise(exercise.id, { active: !exercise.active });
		await refreshAll();
	}

	async function toggleArchived(exercise: CssExerciseAdmin) {
		await updateCssExercise(exercise.id, { archived: !exercise.archived });
		await refreshAll();
	}

	async function startRound(exercise: CssExerciseAdmin) {
		setErrorMessage(null);
		setNotice(null);
		try {
			await startCompetitionRound(exercise.id);
			setNotice(`Ronda iniciada para «${exercise.title}». Los grupos ya pueden corregir.`);
			await refreshAll();
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo iniciar la ronda.');
		}
	}

	async function endRound() {
		setErrorMessage(null);
		setNotice(null);
		try {
			await endCompetitionRound();
			setNotice('Ronda cerrada.');
			await refreshAll();
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo cerrar la ronda.');
		}
	}

	if (loading) return <Spinner />;
	if (!exercises) return <ErrorMessage>{error ?? 'No se pudieron cargar los ejercicios CSS.'}</ErrorMessage>;

	return (
		<div className="space-y-6">
			{notice && <SuccessMessage>{notice}</SuccessMessage>}
			{errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}

			<section className="card p-6">
				<h2 className="text-lg font-bold text-slate-900">Nuevo ejercicio CSS</h2>
				<p className="mt-1 text-sm text-slate-500">
					Crea el ejercicio y, después, añade los selectores y las reglas privadas.
				</p>
				<form onSubmit={handleCreateExercise} className="mt-4 grid gap-4 sm:grid-cols-2">
					<div>
						<label className="label" htmlFor="css-title">Título</label>
						<input
							id="css-title"
							className="input"
							required
							maxLength={120}
							value={form.title}
							onChange={(event) => setForm({ ...form, title: event.target.value })}
							placeholder="Corrige los botones"
						/>
					</div>
					<div>
						<label className="label" htmlFor="css-description">Descripción (opcional)</label>
						<input
							id="css-description"
							className="input"
							maxLength={500}
							value={form.description}
							onChange={(event) => setForm({ ...form, description: event.target.value })}
							placeholder="Corrige el color y el padding del botón"
						/>
					</div>
					<div className="sm:col-span-2">
						<button type="submit" className="btn-primary" disabled={busy}>
							{busy ? 'Creando…' : 'Crear ejercicio CSS'}
						</button>
					</div>
				</form>
			</section>

			<section className="card p-6">
				<h2 className="text-lg font-bold text-slate-900">Ejercicios CSS</h2>
				{exercises.length === 0 ? (
					<InfoMessage>Todavía no hay ejercicios CSS. Crea el primero arriba.</InfoMessage>
				) : (
					<ul className="mt-4 divide-y divide-slate-100">
						{exercises.map((exercise) => (
							<li key={exercise.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
								<div className="min-w-0">
									<p className="truncate font-semibold text-slate-900">{exercise.title}</p>
									<p className="text-xs text-slate-500">
										{exercise.selector_count}{' '}
										{exercise.selector_count === 1 ? 'selector' : 'selectores'}
										{exercise.archived ? ' · archivado' : ''}
										{!exercise.active ? ' · inactivo' : ''}
										{exercise.round ? ' · ronda activa' : ''}
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<button
										type="button"
										className="btn-secondary text-sm"
										onClick={() => setSelectedId(exercise.id === selectedId ? null : exercise.id)}
									>
										{exercise.id === selectedId ? 'Ocultar' : 'Gestionar'}
									</button>
									<button type="button" className="btn-secondary text-sm" onClick={() => void toggleActive(exercise)}>
										{exercise.active ? 'Desactivar' : 'Activar'}
									</button>
									<button
										type="button"
										className="btn-secondary text-sm"
										onClick={() => void toggleArchived(exercise)}
									>
										{exercise.archived ? 'Reabrir' : 'Archivar'}
									</button>
									{!exercise.round && !exercise.archived && exercise.active && (
										<button type="button" className="btn-primary text-sm" onClick={() => void startRound(exercise)}>
											Iniciar ronda
										</button>
									)}
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			{selected && (
				<section className="card space-y-5 p-6">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<h2 className="text-lg font-bold text-slate-900">{selected.title}</h2>
							{selected.description && (
								<p className="mt-1 text-sm text-slate-500">{selected.description}</p>
							)}
						</div>
						<div className="flex flex-wrap gap-2">
							{selected.round && (
								<button type="button" className="btn-secondary text-sm" onClick={() => void endRound()}>
									Cerrar ronda
								</button>
							)}
							<ConfirmButton
								label="Eliminar ejercicio"
								description="Se eliminarán sus selectores y reglas. Si ya hay puntuaciones registradas, no se podrá eliminar."
								onConfirm={async () => {
									await deleteCssExercise(selected.id);
									setSelectedId(null);
									await refreshAll(null);
								}}
							/>
						</div>
					</div>

					{selectorsLoading ? (
						<Spinner label="Cargando selectores…" />
					) : (
						<div className="space-y-5">
							<SelectorForm exerciseId={selected.id} onCreated={() => refreshAll(selected.id)} />
							{selectors.length === 0 ? (
								<InfoMessage>
									Este ejercicio no tiene selectores. Añade el primero (p. ej. <code>.boton</code>).
								</InfoMessage>
							) : (
								selectors.map((selector) => (
									<div key={selector.id} className="rounded-xl border border-slate-200 p-4">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<code className="rounded bg-slate-100 px-2 py-1 font-mono text-sm text-slate-800">
												{selector.selector}
											</code>
											<div className="flex items-center gap-2">
												<span className="text-xs text-slate-400">Posición {selector.position}</span>
												<ConfirmButton
													variant="secondary"
													label="Eliminar selector"
													description="Se eliminarán también sus reglas privadas."
													onConfirm={async () => {
														await deleteCssSelector(selector.id);
														await refreshAll(selected.id);
													}}
												/>
											</div>
										</div>

										<div className="mt-3">
											{selector.rules.length === 0 ? (
												<p className="text-xs text-slate-400">
													Sin reglas: añade una propiedad, su valor esperado y los puntos.
												</p>
											) : (
												<ul className="divide-y divide-slate-100 text-sm">
													{selector.rules.map((rule) => (
														<li key={rule.id} className="flex items-center justify-between gap-2 py-2">
															<span className="font-mono text-slate-700">
																{rule.property_name}: <span className="text-brand-700">{rule.expected_value}</span>
															</span>
															<span className="flex items-center gap-2">
																<span className="badge bg-slate-100 text-slate-600">{rule.points} pts</span>
																<button
																	type="button"
																	className="text-xs font-medium text-rose-600 hover:text-rose-700"
																	onClick={async () => {
																		await deleteCssRule(rule.id);
																		await refreshAll(selected.id);
																	}}
																>
																	Quitar
																</button>
															</span>
														</li>
													))}
												</ul>
											)}
											<RuleForm selectorId={selector.id} onCreated={() => refreshAll(selected.id)} />
										</div>
									</div>
								))
							)}
						</div>
					)}
				</section>
			)}
		</div>
	);
}

function SelectorForm({ exerciseId, onCreated }: { exerciseId: string; onCreated: () => Promise<void> | void }) {
	const [selector, setSelector] = useState('');
	const [busy, setBusy] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setFormError(null);
		try {
			await createCssSelector({ exerciseId, selector });
			setSelector('');
			await onCreated();
		} catch (err) {
			setFormError(err instanceof Error ? err.message : 'No se pudo añadir el selector.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
			<div className="min-w-56 flex-1">
				<label className="label" htmlFor={`selector-${exerciseId}`}>Añadir selector</label>
				<input
					id={`selector-${exerciseId}`}
					className="input font-mono"
					required
					maxLength={200}
					value={selector}
					onChange={(event) => setSelector(event.target.value)}
					placeholder=".boton"
				/>
			</div>
			<button type="submit" className="btn-secondary" disabled={busy}>
				{busy ? 'Añadiendo…' : 'Añadir'}
			</button>
			{formError && <p className="w-full text-xs text-rose-600">{formError}</p>}
		</form>
	);
}

function RuleForm({ selectorId, onCreated }: { selectorId: string; onCreated: () => Promise<void> | void }) {
	const [property, setProperty] = useState('');
	const [expectedValue, setExpectedValue] = useState('');
	const [points, setPoints] = useState('1');
	const [busy, setBusy] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setFormError(null);
		try {
			await createCssRule({
				selectorId,
				property,
				expectedValue,
				points: Number(points) || 1,
			});
			setProperty('');
			setExpectedValue('');
			setPoints('1');
			await onCreated();
		} catch (err) {
			setFormError(err instanceof Error ? err.message : 'No se pudo añadir la regla.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3">
			<div className="min-w-40 flex-1">
				<label className="label" htmlFor={`prop-${selectorId}`}>Propiedad</label>
				<input
					id={`prop-${selectorId}`}
					className="input font-mono"
					required
					maxLength={60}
					value={property}
					onChange={(event) => setProperty(event.target.value)}
					placeholder="background-color"
				/>
			</div>
			<div className="min-w-40 flex-1">
				<label className="label" htmlFor={`value-${selectorId}`}>Valor esperado</label>
				<input
					id={`value-${selectorId}`}
					className="input font-mono"
					required
					maxLength={500}
					value={expectedValue}
					onChange={(event) => setExpectedValue(event.target.value)}
					placeholder="#0ea5e9"
				/>
			</div>
			<div className="w-24">
				<label className="label" htmlFor={`points-${selectorId}`}>Puntos</label>
				<input
					id={`points-${selectorId}`}
					className="input"
					type="number"
					min={1}
					max={1000}
					value={points}
					onChange={(event) => setPoints(event.target.value)}
				/>
			</div>
			<button type="submit" className="btn-secondary" disabled={busy}>
				{busy ? 'Añadiendo…' : 'Añadir regla'}
			</button>
			{formError && <p className="w-full text-xs text-rose-600">{formError}</p>}
		</form>
	);
}