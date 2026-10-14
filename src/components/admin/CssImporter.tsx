'use client';

import { useState, type SubmitEvent } from 'react';
import type {
	CssImportAnalysis,
	CssImportSavePayload,
	CssExerciseAdmin,
} from '@/types';
import {
	analyzeCssImport,
	listCssExercises,
	saveCssImport,
} from '@/lib/data/admin';
import { ErrorMessage, InfoMessage, SuccessMessage, useAsync } from './AdminUI';

const PLACEHOLDER = `.boton {
  display: flex;
  background-color: white;
  justify-content: center;
  padding: 12px 20px;
}

.tarjeta {
  background-color: #ffffff;
  border-radius: 12px;
  padding: 20px;
}`;

interface EditableDeclaration {
	id: string;
	name: string;
	expectedValue: string;
	points: number;
	included: boolean;
}

interface EditableSelector {
	id: string;
	selector: string;
	declarations: EditableDeclaration[];
}

let localSeq = 0;
function nextId(): string {
	localSeq += 1;
	return `css-import-${localSeq}`;
}

function toEditable(analysis: CssImportAnalysis): EditableSelector[] {
	return analysis.selectors.map((selector) => ({
		id: nextId(),
		selector: selector.selector,
		declarations: selector.declarations.map((declaration) => ({
			id: nextId(),
			name: declaration.name,
			expectedValue: declaration.expectedValue,
			points: analysis.basePoints,
			included: true,
		})),
	}));
}

/**
 * Importador de CSS de referencia.
 *
 * El profesor pega un bloque CSS completo; el servidor lo analiza con PostCSS y
 * devuelve los selectores y declaraciones detectados. El profesor revisa,
 * corrige y confirma antes de guardar. Los valores esperados son soluciones
 * privadas: solo se muestran en esta zona administrativa.
 */
export default function CssImporter() {
	const { data: exercises } = useAsync(listCssExercises, []);

	const [source, setSource] = useState('');
	const [analysis, setAnalysis] = useState<CssImportAnalysis | null>(null);
	const [selectors, setSelectors] = useState<EditableSelector[]>([]);
	const [basePoints, setBasePoints] = useState(10);
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [mode, setMode] = useState<'new' | 'replace'>('new');
	const [exerciseId, setExerciseId] = useState<string>('');

	const [busy, setBusy] = useState<'analyze' | 'save' | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const cssExercises: CssExerciseAdmin[] = exercises ?? [];

	function resetAll() {
		setSource('');
		setAnalysis(null);
		setSelectors([]);
		setTitle('');
		setDescription('');
		setExerciseId('');
		setMode('new');
	}

	async function handleAnalyze() {
		setBusy('analyze');
		setNotice(null);
		setErrorMessage(null);
		try {
			const result = await analyzeCssImport(source);
			setAnalysis(result);
			setBasePoints(result.basePoints);
			if (result.ok) {
				setSelectors(toEditable(result));
			} else {
				setSelectors([]);
			}
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo analizar el CSS.');
		} finally {
			setBusy(null);
		}
	}

	function updateSelector(id: string, patch: Partial<EditableSelector>) {
		setSelectors((current) =>
			current.map((selector) => (selector.id === id ? { ...selector, ...patch } : selector)),
		);
	}

	function updateDeclaration(
		selectorId: string,
		declarationId: string,
		patch: Partial<EditableDeclaration>,
	) {
		setSelectors((current) =>
			current.map((selector) =>
				selector.id === selectorId
					? {
							...selector,
							declarations: selector.declarations.map((declaration) =>
								declaration.id === declarationId
									? { ...declaration, ...patch }
									: declaration,
							),
						}
					: selector,
			),
		);
	}

	function removeDeclaration(selectorId: string, declarationId: string) {
		setSelectors((current) =>
			current.map((selector) =>
				selector.id === selectorId
					? {
							...selector,
							declarations: selector.declarations.filter(
								(declaration) => declaration.id !== declarationId,
							),
						}
					: selector,
			),
		);
	}

	function removeSelector(selectorId: string) {
		setSelectors((current) => current.filter((selector) => selector.id !== selectorId));
	}

	function moveSelector(index: number, direction: -1 | 1) {
		setSelectors((current) => {
			const target = index + direction;
			if (target < 0 || target >= current.length) return current;
			const copy = [...current];
			const [moved] = copy.splice(index, 1);
			copy.splice(target, 0, moved!);
			return copy;
		});
	}

	function applyBasePointsToAll() {
		setSelectors((current) =>
			current.map((selector) => ({
				...selector,
				declarations: selector.declarations.map((declaration) => ({
					...declaration,
					points: basePoints,
				})),
			})),
		);
	}

	async function handleSave(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setNotice(null);
		setErrorMessage(null);

		const cleaned = selectors
			.map((selector) => ({
				selector: selector.selector.trim(),
				declarations: selector.declarations
					.filter((declaration) => declaration.included)
					.map((declaration) => ({
						name: declaration.name.trim(),
						expectedValue: declaration.expectedValue.trim(),
						points: declaration.points,
					})),
			}))
			.filter((selector) => selector.declarations.length > 0);

		if (cleaned.length === 0) {
			setErrorMessage('Añade al menos un selector con propiedades incluidas.');
			return;
		}
		if (mode === 'replace' && !exerciseId) {
			setErrorMessage('Elige el ejercicio CSS que quieres actualizar.');
			return;
		}

		const payload: CssImportSavePayload = {
			exerciseId: mode === 'replace' ? exerciseId : null,
			title,
			description: description.trim() ? description.trim() : null,
			basePoints,
			selectors: cleaned,
		};

		setBusy('save');
		try {
			const summary = await saveCssImport(payload);
			setNotice(
				`Ejercicio guardado: ${summary.selectorCount} ${
					summary.selectorCount === 1 ? 'selector' : 'selectores'
				} y ${summary.ruleCount} ${summary.ruleCount === 1 ? 'regla' : 'reglas'}.`,
			);
			resetAll();
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo guardar la importación.');
		} finally {
			setBusy(null);
		}
	}

	const includedCount = selectors.reduce(
		(total, selector) => total + selector.declarations.filter((d) => d.included).length,
		0,
	);

	return (
		<section className="card space-y-5 p-6">
			<div>
				<h2 className="text-lg font-bold text-slate-900">Importar CSS</h2>
				<p className="mt-1 text-sm text-slate-500">
					Pega un bloque CSS completo. Se detectarán automáticamente los selectores y sus
					propiedades. Revisa el resultado antes de guardar. Los valores esperados son
					soluciones privadas: no se muestran a los alumnos.
				</p>
			</div>

			{notice && <SuccessMessage>{notice}</SuccessMessage>}
			{errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}

			<div>
				<label className="label" htmlFor="css-import-source">
					CSS de referencia
				</label>
				<textarea
					id="css-import-source"
					className="input min-h-48 w-full font-mono text-sm"
					value={source}
					onChange={(event) => setSource(event.target.value)}
					placeholder={PLACEHOLDER}
					spellCheck={false}
				/>
				<div className="mt-3 flex flex-wrap items-center gap-2">
					<button
						type="button"
						className="btn-primary"
						onClick={() => void handleAnalyze()}
						disabled={busy !== null || source.trim().length === 0}
					>
						{busy === 'analyze' ? 'Analizando…' : 'Analizar CSS'}
					</button>
					<button
						type="button"
						className="btn-secondary"
						onClick={resetAll}
						disabled={busy !== null}
					>
						Limpiar
					</button>
				</div>
			</div>

			{analysis && (
				<div className="space-y-4">
					<div className="flex flex-wrap gap-2 text-sm">
						<span className="badge bg-slate-100 text-slate-700">
							{analysis.stats.selectorCount}{' '}
							{analysis.stats.selectorCount === 1 ? 'selector' : 'selectores'}
						</span>
						<span className="badge bg-slate-100 text-slate-700">
							{analysis.stats.declarationCount}{' '}
							{analysis.stats.declarationCount === 1 ? 'propiedad' : 'propiedades'}
						</span>
						{analysis.errors.length > 0 && (
							<span className="badge bg-rose-100 text-rose-700">
								{analysis.errors.length} {analysis.errors.length === 1 ? 'error' : 'errores'}
							</span>
						)}
						{analysis.warnings.length > 0 && (
							<span className="badge bg-amber-100 text-amber-700">
								{analysis.warnings.length}{' '}
								{analysis.warnings.length === 1 ? 'aviso' : 'avisos'}
							</span>
						)}
					</div>

					{analysis.errors.length > 0 && (
						<ul className="list-disc space-y-1 rounded-xl bg-rose-50 p-4 pl-8 text-sm text-rose-700">
							{analysis.errors.map((message, index) => (
								<li key={index}>{message}</li>
							))}
						</ul>
					)}
					{analysis.warnings.length > 0 && (
						<ul className="list-disc space-y-1 rounded-xl bg-amber-50 p-4 pl-8 text-sm text-amber-800">
							{analysis.warnings.map((message, index) => (
								<li key={index}>{message}</li>
							))}
						</ul>
					)}
				</div>
			)}

			{analysis?.ok && selectors.length > 0 && (
				<form onSubmit={handleSave} className="space-y-5">
					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<label className="label" htmlFor="css-import-title">Título del ejercicio</label>
							<input
								id="css-import-title"
								className="input"
								required
								maxLength={120}
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="Corrige los botones"
							/>
						</div>
						<div>
							<label className="label" htmlFor="css-import-description">
								Descripción (opcional)
							</label>
							<input
								id="css-import-description"
								className="input"
								maxLength={500}
								value={description}
								onChange={(event) => setDescription(event.target.value)}
								placeholder="Corrige el color y el padding del botón"
							/>
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<label className="label" htmlFor="css-import-mode">Destino</label>
							<select
								id="css-import-mode"
								className="input"
								value={mode}
								onChange={(event) => setMode(event.target.value as 'new' | 'replace')}
							>
								<option value="new">Crear un ejercicio nuevo</option>
								<option value="replace">Reemplazar un ejercicio existente</option>
							</select>
						</div>
						{mode === 'replace' && (
							<div>
								<label className="label" htmlFor="css-import-exercise">Ejercicio</label>
								<select
									id="css-import-exercise"
									className="input"
									value={exerciseId}
									onChange={(event) => setExerciseId(event.target.value)}
									required
								>
									<option value="">Elige un ejercicio…</option>
									{cssExercises.map((exercise) => (
										<option key={exercise.id} value={exercise.id}>
											{exercise.title}
										</option>
									))}
								</select>
								<p className="mt-1 text-xs text-amber-700">
									El reemplazo se bloquea si el ejercicio ya tiene puntuaciones o una ronda
									activa.
								</p>
							</div>
						)}
					</div>

					<div className="flex flex-wrap items-end gap-3">
						<div className="w-32">
							<label className="label" htmlFor="css-import-points">Puntos base</label>
							<input
								id="css-import-points"
								className="input"
								type="number"
								min={1}
								max={1000}
								value={basePoints}
								onChange={(event) => setBasePoints(Number(event.target.value) || 1)}
							/>
						</div>
						<button type="button" className="btn-secondary" onClick={applyBasePointsToAll}>
							Aplicar a todas
						</button>
						<span className="text-xs text-slate-500">
							{includedCount} {includedCount === 1 ? 'propiedad' : 'propiedades'} incluidas
						</span>
					</div>

					<div className="space-y-4">
						{selectors.map((selector, index) => (
							<div key={selector.id} className="rounded-xl border border-slate-200 p-4">
								<div className="flex flex-wrap items-end gap-2">
									<div className="min-w-56 flex-1">
										<label className="label" htmlFor={`sel-${selector.id}`}>
											Selector {index + 1}
										</label>
										<input
											id={`sel-${selector.id}`}
											className="input font-mono"
											value={selector.selector}
											onChange={(event) =>
												updateSelector(selector.id, { selector: event.target.value })
											}
											maxLength={200}
										/>
									</div>
									<div className="flex items-center gap-1">
										<button
											type="button"
											className="btn-secondary text-sm"
											onClick={() => moveSelector(index, -1)}
											disabled={index === 0}
											aria-label="Subir selector"
										>
											↑
										</button>
										<button
											type="button"
											className="btn-secondary text-sm"
											onClick={() => moveSelector(index, 1)}
											disabled={index === selectors.length - 1}
											aria-label="Bajar selector"
										>
											↓
										</button>
										<button
											type="button"
											className="text-sm font-medium text-rose-600 hover:text-rose-700"
											onClick={() => removeSelector(selector.id)}
										>
											Eliminar selector
										</button>
									</div>
								</div>

								<table className="mt-3 w-full text-sm">
									<thead>
										<tr className="text-left text-xs uppercase tracking-wide text-slate-400">
											<th className="py-1 pr-2">Incluir</th>
											<th className="py-1 pr-2">Propiedad</th>
											<th className="py-1 pr-2">Valor esperado</th>
											<th className="py-1 pr-2">Puntos</th>
											<th className="py-1" />
										</tr>
									</thead>
									<tbody>
										{selector.declarations.map((declaration) => (
											<tr key={declaration.id} className="border-t border-slate-100">
												<td className="py-1.5 pr-2">
													<input
														type="checkbox"
														checked={declaration.included}
														onChange={(event) =>
															updateDeclaration(selector.id, declaration.id, {
																included: event.target.checked,
															})
														}
														aria-label={`Incluir ${declaration.name}`}
													/>
												</td>
												<td className="py-1.5 pr-2">
													<input
														className="input font-mono"
														value={declaration.name}
														onChange={(event) =>
															updateDeclaration(selector.id, declaration.id, {
																name: event.target.value,
															})
														}
														maxLength={60}
														aria-label="Propiedad"
													/>
												</td>
												<td className="py-1.5 pr-2">
													<input
														className="input font-mono"
														value={declaration.expectedValue}
														onChange={(event) =>
															updateDeclaration(selector.id, declaration.id, {
																expectedValue: event.target.value,
															})
														}
														maxLength={500}
														aria-label="Valor esperado"
													/>
												</td>
												<td className="w-20 py-1.5 pr-2">
													<input
														className="input"
														type="number"
														min={1}
														max={1000}
														value={declaration.points}
														onChange={(event) =>
															updateDeclaration(selector.id, declaration.id, {
																points: Number(event.target.value) || 1,
															})
														}
														aria-label="Puntos"
													/>
												</td>
												<td className="py-1.5 text-right">
													<button
														type="button"
														className="text-xs font-medium text-rose-600 hover:text-rose-700"
														onClick={() => removeDeclaration(selector.id, declaration.id)}
													>
														Quitar
													</button>
												</td>
											</tr>
										))}
										{selector.declarations.length === 0 && (
											<tr>
												<td colSpan={5} className="py-2 text-xs text-slate-400">
													Sin propiedades: este selector se omitirá al guardar.
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						))}
					</div>

					<div>
						<button type="submit" className="btn-primary" disabled={busy !== null}>
							{busy === 'save' ? 'Guardando…' : 'Guardar ejercicio'}
						</button>
					</div>
				</form>
			)}

			{analysis && !analysis.ok && (
				<InfoMessage>
					Corrige los errores indicados y vuelve a pulsar «Analizar CSS». No se ha guardado nada.
				</InfoMessage>
			)}
		</section>
	);
}
