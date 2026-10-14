'use client';

import { useCallback, useState, type SubmitEvent } from 'react';
import type { StudentPortalData, SubmissionResult } from '@/types';
import { formatDateTime, initials } from '@/lib/format';

const RESULT_STYLES: Record<string, string> = {
	success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
	already_solved: 'border-sky-200 bg-sky-50 text-sky-800',
	wrong_code: 'border-rose-200 bg-rose-50 text-rose-800',
	invalid_code: 'border-amber-200 bg-amber-50 text-amber-800',
	invalid_student: 'border-rose-200 bg-rose-50 text-rose-800',
	inactive_student: 'border-amber-200 bg-amber-50 text-amber-800',
	inactive_group: 'border-amber-200 bg-amber-50 text-amber-800',
	no_group: 'border-amber-200 bg-amber-50 text-amber-800',
	rate_limited: 'border-amber-200 bg-amber-50 text-amber-800',
	error: 'border-rose-200 bg-rose-50 text-rose-800',
};

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; data: T }> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	const data = (await response.json().catch(() => ({}))) as T;
	return { ok: response.ok, data };
}

/** Portal del alumno: identificación por código de acceso y envío de códigos. */
export default function StudentPortal() {
	const [accessCode, setAccessCode] = useState('');
	const [portal, setPortal] = useState<StudentPortalData | null>(null);
	const [identifying, setIdentifying] = useState(false);
	const [identifyError, setIdentifyError] = useState<string | null>(null);

	const [code, setCode] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<SubmissionResult | null>(null);

	const refreshPortal = useCallback(
		async (studentCode: string) => {
			const { data } = await postJson<StudentPortalData>('/api/student/portal', {
				studentCode,
			});
			if (data.status === 'ok') setPortal(data);
		},
		[],
	);

	async function handleIdentify(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setIdentifying(true);
		setIdentifyError(null);
		try {
			const { ok, data } = await postJson<StudentPortalData & { error?: string }>(
				'/api/student/portal',
				{ studentCode: accessCode },
			);
			if (!ok || data.status !== 'ok') {
				setIdentifyError(data.message ?? data.error ?? 'No se pudo identificar al alumno.');
				return;
			}
			setPortal(data);
			setResult(null);
		} catch {
			setIdentifyError('Error de conexión. Inténtalo de nuevo.');
		} finally {
			setIdentifying(false);
		}
	}

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!portal) return;
		setSubmitting(true);
		setResult(null);
		try {
			const { ok, data } = await postJson<SubmissionResult & { error?: string }>(
				'/api/submit-code',
				{ studentCode: accessCode, exerciseCode: code },
			);
			if (!ok) {
				setResult({ status: 'error', message: data.error ?? 'No se pudo procesar el envío.' });
				return;
			}
			setResult(data);
			if (data.status === 'success' || data.status === 'already_solved') {
				setCode('');
				void refreshPortal(accessCode);
			}
		} catch {
			setResult({ status: 'error', message: 'Error de conexión. Inténtalo de nuevo.' });
		} finally {
			setSubmitting(false);
		}
	}

	function reset() {
		setPortal(null);
		setAccessCode('');
		setCode('');
		setResult(null);
		setIdentifyError(null);
	}

	if (!portal) {
		return (
			<div className="mx-auto w-full max-w-md">
				<form onSubmit={handleIdentify} className="card animate-slide-up space-y-4 p-6">
					<div className="flex flex-col items-center gap-2 text-center">
						<span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white">
							<svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
								<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" strokeLinecap="round" strokeLinejoin="round" />
								<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
						</span>
						<h2 className="text-lg font-semibold text-slate-900">Identifícate</h2>
						<p className="text-sm text-slate-500">
							Introduce tu código personal de alumno para acceder a los ejercicios.
						</p>
					</div>

					<div>
						<label className="label" htmlFor="access-code">
							Código de alumno
						</label>
						<input
							id="access-code"
							name="access-code"
							className="input text-center font-mono text-base tracking-widest uppercase"
							value={accessCode}
							onChange={(event) => setAccessCode(event.target.value)}
							autoComplete="off"
							autoCapitalize="characters"
							placeholder="ABC123"
							required
						/>
					</div>

					{identifyError && (
						<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
							{identifyError}
						</p>
					)}

					<button type="submit" className="btn-primary w-full" disabled={identifying}>
						{identifying ? 'Comprobando…' : 'Entrar'}
					</button>

					<p className="text-center text-xs text-slate-400">
						Tu código te lo entrega el profesor. No lo compartas con otros alumnos.
					</p>
				</form>
			</div>
		);
	}

	const group = portal.group;
	const completed = portal.completed ?? [];
	const pending = portal.pending ?? [];

	return (
		<div className="space-y-6">
			<div className="card flex flex-wrap items-center justify-between gap-4 p-5">
				<div className="flex items-center gap-3">
					<span className="grid h-11 w-11 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">
						{initials(portal.student?.name ?? '?')}
					</span>
					<div>
						<p className="text-sm font-semibold text-slate-900">{portal.student?.name}</p>
						{group ? (
							<p className="flex items-center gap-1.5 text-xs text-slate-500">
								<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
								Grupo {group.name}
							</p>
						) : (
							<p className="text-xs text-amber-600">Aún sin grupo asignado</p>
						)}
					</div>
				</div>
				<button type="button" className="btn-secondary" onClick={reset}>
					Cambiar de alumno
				</button>
			</div>

			<div className="grid gap-6 lg:grid-cols-5">
				<form onSubmit={handleSubmit} className="card space-y-4 p-5 lg:col-span-3">
					<div>
						<h2 className="text-base font-semibold text-slate-900">Enviar código</h2>
						<p className="text-sm text-slate-500">
							Escribe el código del ejercicio. Si es correcto, tu grupo suma puntos.
						</p>
					</div>

					<div>
						<label className="label" htmlFor="exercise-code">
							Código del ejercicio
						</label>
						<input
							id="exercise-code"
							name="exercise-code"
							className="input text-center font-mono text-lg tracking-[0.3em]"
							value={code}
							onChange={(event) => setCode(event.target.value)}
							autoComplete="off"
							placeholder="••••••"
							required
						/>
					</div>

					<button type="submit" className="btn-primary w-full" disabled={submitting || !code.trim()}>
						{submitting ? 'Enviando…' : 'Comprobar código'}
					</button>

					<div aria-live="polite">
						{result && (
							<div
								className={[
									'animate-slide-up flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
									RESULT_STYLES[result.status] ?? RESULT_STYLES.error,
								].join(' ')}
							>
								<span aria-hidden="true">
									{result.status === 'success' ? '🎉' : result.status === 'already_solved' ? 'ℹ️' : '⚠️'}
								</span>
								<div>
									<p className="font-semibold">
										{result.status === 'success'
											? `¡Correcto! +${result.points ?? 0} puntos`
											: result.message}
									</p>
									{result.status === 'success' && (
										<p className="mt-0.5 text-xs opacity-80">
											La clasificación de tu grupo se ha actualizado.
										</p>
									)}
								</div>
							</div>
						)}
					</div>
				</form>

				<div className="space-y-6 lg:col-span-2">
					<div className="card p-5">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold text-slate-900">Completados</h3>
							<span className="badge bg-emerald-100 text-emerald-700">{completed.length}</span>
						</div>
						{completed.length === 0 ? (
							<p className="mt-3 text-sm text-slate-500">
								Tu grupo todavía no ha resuelto ningún ejercicio.
							</p>
						) : (
							<ul className="mt-3 divide-y divide-slate-100">
								{completed.map((item) => (
									<li key={item.exercise_id} className="flex items-center justify-between gap-3 py-2.5">
										<div className="min-w-0">
											<p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
											<p className="text-xs text-slate-400">{formatDateTime(item.submitted_at)}</p>
										</div>
										<span className="badge shrink-0 bg-emerald-100 text-emerald-700">
											+{item.points}
										</span>
									</li>
								))}
							</ul>
						)}
					</div>

					<div className="card p-5">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold text-slate-900">Disponibles</h3>
							<span className="badge bg-slate-100 text-slate-600">{pending.length}</span>
						</div>
						{pending.length === 0 ? (
							<p className="mt-3 text-sm text-slate-500">No quedan ejercicios activos.</p>
						) : (
							<ul className="mt-3 space-y-2">
								{pending.map((item) => (
									<li key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
										<p className="text-sm font-medium text-slate-800">{item.title}</p>
										{item.description && <p className="text-xs text-slate-500">{item.description}</p>}
									</li>
								))}
							</ul>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
