'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { CompetitionSelectorView, CompetitionState, CompetitionSubmitResult } from '@/types';
import { formatPoints, initials } from '@/lib/format';
import RankingLive from '@/components/ranking/RankingLive';
import {
	browserDraftStorage,
	createDraftStore,
	SELECTOR_STATUS_LABELS,
	resolveActiveSelector,
	skeleton,
} from '@/lib/competition/draft';

async function requestState(): Promise<{ ok: boolean; status: number; data: CompetitionState }> {
	const response = await fetch('/api/competicion/estado', {
		headers: { accept: 'application/json' },
	});
	const data = (await response.json().catch(() => ({}))) as CompetitionState;
	return { ok: response.ok, status: response.status, data };
}

/** Identificador de idempotencia de una entrega (UUID v4). */
function newRequestId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	// Reserva: solo se usa para idempotencia, no para seguridad.
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
		const value = (Math.random() * 16) | 0;
		const nibble = char === 'x' ? value : (value & 0x3) | 0x8;
		return nibble.toString(16);
	});
}

const STATUS_BADGE: Record<CompetitionSelectorView['status'], string> = {
	pending: 'bg-slate-100 text-slate-600',
	in_progress: 'bg-amber-100 text-amber-700',
	completed: 'bg-emerald-100 text-emerald-700',
};

/**
 * Vista del grupo en la competición CSS.
 *
 * Permite navegar libremente entre todos los selectores del ejercicio, volver a
 * los anteriores y conservar el borrador de cada uno aunque no se haya enviado.
 * El estado de cada selector es agregado (pendiente / en progreso / completado)
 * y nunca revela qué propiedades concretas son correctas. La puntuación la
 * decide siempre el servidor; este componente nunca la calcula.
 */
export default function CompetitionView() {
	const [state, setState] = useState<CompetitionState | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [activeId, setActiveId] = useState<string | null>(null);
	const [css, setCss] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<CompetitionSubmitResult | null>(null);
	const [copied, setCopied] = useState(false);

	const router = useRouter();
	const draftStore = useMemo(() => createDraftStore(browserDraftStorage()), []);
	// Mismo requestId hasta recibir una respuesta: un reintento tras un fallo de
	// red no vuelve a puntuar ni a penalizar la misma entrega.
	const requestIdRef = useRef<string | null>(null);

	const loadState = useCallback(async () => {
		try {
			const { ok, status, data } = await requestState();
			if (status === 401) {
				router.replace('/competicion/entrar');
				return;
			}
			if (!ok) {
				setError('No se pudo cargar el estado de la competición.');
				return;
			}
			setState(data);
			setError(null);
		} catch {
			setError('Error de conexión. Inténtalo de nuevo.');
		} finally {
			setLoading(false);
		}
	}, [router]);

	useEffect(() => {
		// Sincroniza con el servidor al montar (fetch-on-mount deliberado).
		// eslint-disable-next-line react-hooks/set-state-in-effect
		void loadState();
	}, [loadState]);

	// Elige el selector activo respetando la preferencia del usuario.
	useEffect(() => {
		const exercise = state?.exercise;
		if (!exercise || state?.status !== 'ok') return;
		const stored = draftStore.getActive(exercise.id);
		// Inicializa el selector activo desde el borrador guardado (fuente externa).
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setActiveId((current) => resolveActiveSelector(state.selectors, current ?? stored));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state?.exercise?.id, state?.selectors, state?.status]);

	// Al cambiar el selector activo: recuerda cuál está abierto y carga su
	// borrador (solo se ejecuta al cambiar de selector, no al recargar estado,
	// para no sobrescribir lo que el grupo está escribiendo).
	useEffect(() => {
		const exercise = state?.exercise;
		if (!exercise || !activeId) return;
		draftStore.setActive(exercise.id, activeId);
		const selector = state.selectors.find((item) => item.id === activeId);
		const draft = draftStore.getDraft(exercise.id, activeId);
		// Carga el borrador del selector al cambiar de pestaña (fuente externa).
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setCss(draft ?? skeleton(selector?.selector ?? ''));
		setResult(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeId, state?.exercise?.id]);

	function handleCssChange(value: string) {
		setCss(value);
		const exercise = state?.exercise;
		if (exercise && activeId) draftStore.setDraft(exercise.id, activeId, value);
	}

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		const exercise = state?.exercise;
		if (!exercise || !activeId) return;
		setSubmitting(true);
		setResult(null);
		const requestId = requestIdRef.current ?? newRequestId();
		requestIdRef.current = requestId;
		try {
			const response = await fetch('/api/competicion/entregar', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ selectorId: activeId, css, requestId }),
			});
			// Se recibió respuesta: la operación quedó resuelta en el servidor.
			requestIdRef.current = null;
			const data = (await response.json().catch(() => ({}))) as CompetitionSubmitResult & {
				error?: string;
			};
			setResult({
				status: data.status ?? 'error',
				awarded: data.awarded ?? 0,
				penalty: data.penalty ?? 0,
				net: data.net ?? 0,
				new_properties: data.new_properties ?? 0,
				fully_correct: data.fully_correct ?? false,
				speed_bonus: data.speed_bonus ?? false,
				message: data.message ?? data.error ?? 'No se pudo evaluar la entrega.',
			});
			await loadState();
		} catch {
			// Se conserva el requestId para que el reintento no duplique efectos.
			setResult({
				status: 'error',
				awarded: 0,
				penalty: 0,
				net: 0,
				new_properties: 0,
				fully_correct: false,
				speed_bonus: false,
				message: 'Error de conexión. Inténtalo de nuevo: no se duplicará la puntuación.',
			});
		} finally {
			setSubmitting(false);
		}
	}

	async function copySelector() {
		if (!activeSelector) return;
		try {
			await navigator.clipboard.writeText(skeleton(activeSelector.selector));
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	}

	if (loading) {
		return (
			<div className="card p-10 text-center text-sm text-slate-500" role="status" aria-live="polite">
				Cargando la competición…
			</div>
		);
	}

	if (error || !state) {
		return (
			<div className="card border-rose-200 bg-rose-50 p-6 text-sm text-rose-700" role="alert">
				{error ?? 'No se pudo cargar la competición.'}
			</div>
		);
	}

	const selectors = state.status === 'ok' ? state.selectors : [];
	const activeSelector = selectors.find((item) => item.id === activeId) ?? null;
	const progress = state.progress;
	const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

	return (
		<div className="space-y-6">
			<header className="card flex flex-wrap items-center justify-between gap-4 p-5">
				<div className="flex items-center gap-3">
					<span
						className="grid h-11 w-11 place-items-center rounded-2xl text-sm font-bold text-white"
						style={{ backgroundColor: state.group.color }}
						aria-hidden="true"
					>
						{initials(state.group.name)}
					</span>
					<div>
						<p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Grupo</p>
						<p className="text-lg font-bold text-slate-900">{state.group.name}</p>
					</div>
				</div>
				<div className="flex items-center gap-5">
					<div className="text-right">
						<p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Puntos</p>
						<p className="text-lg font-bold text-slate-900">{formatPoints(state.totalPoints)}</p>
					</div>
					{state.position ? (
						<div className="text-right">
							<p className="text-xs font-medium tracking-wide text-slate-400 uppercase">Posición</p>
							<p className="text-lg font-bold text-slate-900">#{state.position}</p>
						</div>
					) : null}
					<form method="post" action="/api/competicion/salir">
						<button type="submit" className="btn-secondary text-sm">
							Salir
						</button>
					</form>
				</div>
			</header>

			{state.status === 'no_round' && (
				<div className="card p-6 text-center text-sm text-slate-500">
					Todavía no hay competición activa. Espera a que tu profesor inicie una ronda.
				</div>
			)}

			{state.status === 'inactive_group' && (
				<div className="card border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
					{state.message ?? 'El grupo no puede participar por ahora.'}
				</div>
			)}

			{state.status === 'not_participating' && (
				<div className="card border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
					{state.message ?? 'Tu grupo no participa en esta competición.'}
				</div>
			)}

			{state.status === 'ok' && state.exercise && (
				<div className="space-y-6">
					<div className="card p-6">
						<div className="flex flex-wrap items-baseline justify-between gap-2">
							<h1 className="text-xl font-bold text-slate-900">{state.exercise.title}</h1>
							{state.allSelectorsDone && (
								<span className="badge bg-emerald-100 text-emerald-700">Completado</span>
							)}
						</div>
						{state.exercise.description && (
							<p className="mt-2 text-sm text-slate-500">{state.exercise.description}</p>
						)}

						{progress.total > 0 && (
							<div className="mt-4">
								<div className="flex items-center justify-between text-xs font-medium text-slate-500">
									<span>Progreso: {progress.completed} / {progress.total} selectores</span>
									<span>{percent}%</span>
								</div>
								<div
									className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
									role="progressbar"
									aria-valuemin={0}
									aria-valuemax={progress.total}
									aria-valuenow={progress.completed}
									aria-label="Progreso de selectores completados"
								>
									<div
										className="h-full rounded-full bg-brand-500 transition-all duration-500"
										style={{ width: `${percent}%` }}
									/>
								</div>
							</div>
						)}

						{state.allSelectorsDone && (
							<div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
								<p className="text-base font-semibold text-emerald-800">
									¡Habéis completado todos los selectores de este ejercicio!
								</p>
								<p className="mt-1 text-sm text-emerald-700">
									Podéis revisar cualquiera de ellos o esperar a la siguiente ronda.
								</p>
							</div>
						)}
					</div>

					{selectors.length === 0 ? (
						<div className="card p-6 text-center text-sm text-slate-500">
							Este ejercicio todavía no tiene selectores disponibles.
						</div>
					) : (
						<>
							<nav className="card p-4" aria-label="Selectores del ejercicio">
								<p className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
									Selectores
								</p>
								<ul className="flex flex-wrap gap-2">
									{selectors.map((selector, index) => {
										const isActive = selector.id === activeId;
										return (
											<li key={selector.id}>
												<button
													type="button"
													onClick={() => setActiveId(selector.id)}
													aria-current={isActive ? 'true' : undefined}
													className={[
														'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition',
														isActive
															? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
															: 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
													].join(' ')}
												>
													<span className="font-mono text-xs text-slate-400">
														#{index + 1}
													</span>
													<span className="max-w-40 truncate font-mono">
														{selector.selector}
													</span>
													<span
														className={[
															'badge',
															STATUS_BADGE[selector.status],
														].join(' ')}
													>
														{SELECTOR_STATUS_LABELS[selector.status]}
													</span>
												</button>
											</li>
										);
									})}
								</ul>
							</nav>

							{activeSelector && (
								<form onSubmit={handleSubmit} className="card space-y-4 p-6">
									<div>
										<div className="flex items-center justify-between gap-2">
											<span className="label">Selector a corregir</span>
											<button
												type="button"
												className="text-xs font-medium text-brand-600 hover:text-brand-700"
												onClick={copySelector}
											>
												{copied ? '¡Copiado!' : 'Copiar selector'}
											</button>
										</div>
										<pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 font-mono text-sm text-emerald-300">
											{activeSelector.selector}
										</pre>
										<p className="mt-2 text-xs text-slate-400">
											Estado:{' '}
											<span className="font-medium text-slate-600">
												{SELECTOR_STATUS_LABELS[activeSelector.status]}
											</span>
										</p>
									</div>

									<div>
										<label className="label" htmlFor="selector">
											Escribe el CSS corregido (puedes copiar y pegar)
										</label>
										<textarea
											id="selector"
											className="input min-h-40 font-mono text-sm leading-relaxed"
											spellCheck={false}
											autoCapitalize="off"
											autoCorrect="off"
											value={css}
											onChange={(event) => handleCssChange(event.target.value)}
											placeholder={skeleton(activeSelector.selector)}
										/>
										<p className="mt-1 text-xs text-slate-400">
											Tu borrador se conserva aunque cambies de selector o recargues la página.
										</p>
									</div>

									<div className="flex items-center justify-between gap-3">
										<p className="text-xs text-slate-400">
											Cada propiedad correcta suma puntos una sola vez. Los intentos son ilimitados.
										</p>
										<button type="submit" className="btn-primary" disabled={submitting}>
											{submitting ? 'Evaluando…' : 'Enviar'}
										</button>
									</div>

									{result && (
										<div
											role="status"
											aria-live="polite"
											className={[
												'rounded-xl border px-4 py-3 text-sm',
												result.net < 0
													? 'border-rose-200 bg-rose-50 text-rose-800'
													: result.awarded > 0
														? 'border-emerald-200 bg-emerald-50 text-emerald-800'
														: 'border-slate-200 bg-slate-50 text-slate-700',
											].join(' ')}
										>
											<p className="font-semibold">{result.message}</p>
											{result.awarded > 0 && (
												<p className="mt-1">
													Has obtenido <strong>+{formatPoints(result.awarded)}</strong> en esta entrega.
												</p>
											)}
											{result.penalty > 0 && (
												<p className="mt-1">
													Penalización aplicada: <strong>−{formatPoints(result.penalty)}</strong>.
												</p>
											)}
											{(result.awarded > 0 || result.penalty > 0) && (
												<p className="mt-1 text-slate-500">
													Saldo neto de la entrega: {result.net >= 0 ? '+' : '−'}
													{formatPoints(Math.abs(result.net))}.
												</p>
											)}
										</div>
									)}
								</form>
							)}
						</>
					)}
				</div>
			)}

			<section className="space-y-4">
				<h2 className="text-lg font-bold text-slate-900">Clasificación</h2>
				<RankingLive initialEntries={state.ranking} />
			</section>
		</div>
	);
}
