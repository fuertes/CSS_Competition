'use client';

import { useMemo, useState, type SubmitEvent } from 'react';
import type { ExerciseRow, GroupRow } from '@/types';
import {
	createExercise,
	deleteExercise,
	listExercises,
	listGroups,
	listSubmissions,
	setExerciseCode,
	updateExercise,
	type SubmissionDetail,
} from '@/lib/data/admin';
import { formatDateTime } from '@/lib/format';
import {
	ConfirmButton,
	ErrorMessage,
	InfoMessage,
	Spinner,
	SuccessMessage,
	useAsync,
} from './AdminUI';

interface ExerciseFormState {
	id: string | null;
	title: string;
	description: string;
	points: number;
	active: boolean;
}

const emptyForm = (defaultPoints: number): ExerciseFormState => ({
	id: null,
	title: '',
	description: '',
	points: defaultPoints,
	active: true,
});

/** Gestión de ejercicios y códigos secretos. */
export default function ExercisesManager() {
	const { data, error, loading, reload } = useAsync(async () => {
		const [exercises, submissions, groups] = await Promise.all([
			listExercises(),
			listSubmissions(),
			listGroups(),
		]);
		// La página de ejercicios gestiona el juego de códigos; los ejercicios
		// CSS se administran en su propia sección (/admin/css).
		return { exercises: exercises.filter((exercise) => exercise.kind === 'code'), submissions, groups };
	}, []);

	const [form, setForm] = useState<ExerciseFormState | null>(null);
	const [codeTarget, setCodeTarget] = useState<ExerciseRow | null>(null);
	const [codeInput, setCodeInput] = useState('');
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const solvedByExercise = useMemo(() => {
		const map = new Map<string, Array<{ group: GroupRow; detail: SubmissionDetail }>>();
		for (const submission of data?.submissions ?? []) {
			const list = map.get(submission.exercise_id) ?? [];
			const group = data?.groups.find((candidate) => candidate.id === submission.group_id);
			if (group) list.push({ group, detail: submission });
			map.set(submission.exercise_id, list);
		}
		return map;
	}, [data]);

	if (loading) return <Spinner />;
	if (!data) return <ErrorMessage>{error ?? 'No se pudieron cargar los ejercicios.'}</ErrorMessage>;

	async function handleSave(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!form) return;
		setBusy(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			if (form.id) {
				await updateExercise(form.id, { ...form, description: form.description || null });
				setNotice('Ejercicio actualizado.');
			} else {
				await createExercise({ ...form, description: form.description || null });
				setNotice('Ejercicio creado.');
			}
			setForm(null);
			reload();
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo guardar el ejercicio.');
		} finally {
			setBusy(false);
		}
	}

	async function handleSetCode(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!codeTarget) return;
		setBusy(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			await setExerciseCode(codeTarget.id, codeInput);
			setNotice(`Código guardado para «${codeTarget.title}».`);
			setCodeTarget(null);
			setCodeInput('');
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo guardar el código.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold text-slate-900">Ejercicios</h2>
					<p className="text-sm text-slate-500">
						Los códigos se guardan cifrados. Nunca se muestran de nuevo.
					</p>
				</div>
				{!form && (
					<button
						type="button"
						className="btn-primary"
						onClick={() => {
							setForm(emptyForm(data.exercises[0]?.points ?? 100));
							setErrorMessage(null);
						}}
					>
						Nuevo ejercicio
					</button>
				)}
			</div>

			{notice && <SuccessMessage>{notice}</SuccessMessage>}
			{errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}

			{form && (
				<form onSubmit={handleSave} className="card animate-slide-up space-y-4 p-5">
					<h3 className="text-sm font-semibold text-slate-900">
						{form.id ? 'Editar ejercicio' : 'Nuevo ejercicio'}
					</h3>
					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<label className="label" htmlFor="exercise-title">
								Título
							</label>
							<input
								id="exercise-title"
								className="input"
								value={form.title}
								onChange={(event) => setForm({ ...form, title: event.target.value })}
								required
								maxLength={120}
							/>
						</div>
						<div>
							<label className="label" htmlFor="exercise-points">
								Puntos
							</label>
							<input
								id="exercise-points"
								type="number"
								min={1}
								className="input"
								value={form.points}
								onChange={(event) => setForm({ ...form, points: Number(event.target.value) })}
								required
							/>
						</div>
					</div>
					<div>
						<label className="label" htmlFor="exercise-description">
							Descripción (opcional)
						</label>
						<textarea
							id="exercise-description"
							className="input min-h-20"
							value={form.description}
							onChange={(event) => setForm({ ...form, description: event.target.value })}
							maxLength={500}
							placeholder="Pregunta o pista visible para los alumnos…"
						/>
					</div>
					<div>
						<label className="label" htmlFor="exercise-active">
							Estado
						</label>
						<select
							id="exercise-active"
							className="input sm:max-w-48"
							value={form.active ? 'active' : 'inactive'}
							onChange={(event) => setForm({ ...form, active: event.target.value === 'active' })}
						>
							<option value="active">Activo (puntúa)</option>
							<option value="inactive">Inactivo (no puntúa)</option>
						</select>
					</div>
					<div className="flex flex-wrap justify-end gap-2">
						<button
							type="button"
							className="btn-secondary"
							onClick={() => {
								setForm(null);
								setNotice(null);
							}}
						>
							Cancelar
						</button>
						<button type="submit" className="btn-primary" disabled={busy}>
							{busy ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear ejercicio'}
						</button>
					</div>
				</form>
			)}

			{data.exercises.length === 0 ? (
				<div className="card">
					<InfoMessage>
						Aún no hay ejercicios. Crea uno y asigna su código secreto.
					</InfoMessage>
				</div>
			) : (
				<div className="space-y-3">
					{data.exercises.map((exercise) => {
						const solved = solvedByExercise.get(exercise.id) ?? [];
						return (
							<div
								key={exercise.id}
								className={[
									'card p-0',
									(!exercise.active || exercise.archived) ? 'opacity-70' : '',
								].join(' ')}
							>
								<div className="flex flex-wrap items-center gap-3 px-5 py-4">
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<p className="truncate text-sm font-semibold text-slate-900">
												{exercise.title}
											</p>
											<span className="badge bg-brand-100 text-brand-700">+{exercise.points}</span>
											{exercise.active && !exercise.archived && (
												<span className="badge bg-emerald-100 text-emerald-700">Activo</span>
											)}
											{!exercise.active && (
												<span className="badge bg-slate-100 text-slate-500">Inactivo</span>
											)}
											{exercise.archived && (
												<span className="badge bg-slate-100 text-slate-500">Archivado</span>
											)}
										</div>
										{exercise.description && (
											<p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
												{exercise.description}
											</p>
										)}
										<p className="mt-1 text-xs text-slate-400">
											Creado {formatDateTime(exercise.created_at)}
										</p>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<button
											type="button"
											className="btn-primary"
											onClick={() => {
												setCodeTarget(exercise);
												setCodeInput('');
												setErrorMessage(null);
											}}
										>
											{exercise.code_set ? 'Cambiar código' : 'Establecer código'}
										</button>
										<button
											type="button"
											className="btn-secondary"
											onClick={() =>
												setForm({
													id: exercise.id,
													title: exercise.title,
													description: exercise.description ?? '',
													points: exercise.points,
													active: exercise.active,
												})
											}
										>
											Editar
										</button>
										<ConfirmButton
											label={exercise.archived ? 'Restaurar' : 'Archivar'}
											description={
												exercise.archived
													? 'El ejercicio volverá a estar visible.'
													: 'El ejercicio quedará oculto pero su historial de resoluciones se conserva.'
											}
											confirmLabel="Confirmar"
											variant="secondary"
											onConfirm={async () => {
												await updateExercise(exercise.id, { archived: !exercise.archived });
												reload();
											}}
										/>
										<ConfirmButton
											label="Eliminar"
											description="Se eliminará el ejercicio. La base de datos rechazará el borrado si tiene resoluciones registradas; en ese caso archívalo."
											onConfirm={async () => {
												await deleteExercise(exercise.id);
												reload();
											}}
										/>
									</div>
								</div>
								{solved.length > 0 && (
									<div className="border-t border-slate-100 px-5 py-3">
										<p className="text-xs font-semibold text-slate-500 uppercase">
											Resuelto por ({solved.length})
										</p>
										<ul className="mt-1.5 flex flex-wrap gap-2">
											{solved.map(({ group, detail }) => (
												<li
													key={group.id}
													className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
												>
													<span
														className="h-2 w-2 rounded-full"
														style={{ backgroundColor: group.color }}
													/>
													{group.name}
													<span className="text-slate-400">
														· {detail.awarded_points} pts · {formatDateTime(detail.submitted_at)}
													</span>
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}

			{codeTarget && (
				<div
					className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
					role="dialog"
					aria-modal="true"
					aria-label={`Código de ${codeTarget.title}`}
					onClick={(event) => {
						if (event.currentTarget === event.target) setCodeTarget(null);
					}}
				>
					<form onSubmit={(event) => void handleSetCode(event)} className="card w-full max-w-md animate-pop space-y-4 p-6">
						<h3 className="text-base font-semibold text-slate-900">
							Código de «{codeTarget.title}»
						</h3>
						<p className="text-sm text-slate-600">
							El código se cifrará y no se podrá consultar después. Los alumnos lo introducen en la zona
							de alumnos.
						</p>
						<div>
							<label className="label" htmlFor="exercise-code-input">
								Código secreto
							</label>
							<input
								id="exercise-code-input"
								className="input text-center font-mono tracking-[0.3em]"
								value={codeInput}
								onChange={(event) => setCodeInput(event.target.value)}
								required
								maxLength={64}
								autoComplete="off"
							/>
						</div>
						<div className="flex justify-end gap-2">
							<button type="button" className="btn-secondary" onClick={() => setCodeTarget(null)}>
								Cancelar
							</button>
							<button type="submit" className="btn-primary" disabled={busy}>
								{busy ? 'Guardando…' : 'Guardar código'}
							</button>
						</div>
					</form>
				</div>
			)}
		</div>
	);
}