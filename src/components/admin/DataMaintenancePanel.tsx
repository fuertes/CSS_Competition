'use client';

import { useEffect, useState } from 'react';
import type { PurgePreview, PurgeResult, PurgeScope } from '@/types';
import { getPurgePreview, purgeEntities } from '@/lib/data/admin';
import { PURGE_ACTIONS, PURGE_SCOPES, type PurgeDefinition } from '@/lib/maintenance';
import { ErrorMessage, InfoMessage, Spinner, SuccessMessage, useAsync } from './AdminUI';

/** Explica en frases claras el alcance de una purga y qué se conserva. */
function scopeSummary(scope: PurgeScope, preview: PurgePreview): string[] {
	switch (scope) {
		case 'groups':
			return [
				`Se eliminarán ${preview.groups} grupos y sus códigos de acceso.`,
				`También se eliminarán ${preview.submissions} resoluciones del juego de códigos y el historial de puntuación asociado (${preview.scoringEvents} eventos, ${preview.propertyScores} propiedades, ${preview.groupAttempts} intentos, ${preview.participants} participaciones y ${preview.groupSessions} sesiones).`,
				'Los alumnos se conservan, pero quedarán SIN grupo asignado.',
				`Se conservan los ejercicios y sus soluciones, las ${preview.rounds} competiciones y la configuración.`,
			];
		case 'students':
			return [
				`Se eliminarán ${preview.students} alumnos.`,
				`También se eliminarán ${preview.submissions} resoluciones del juego de códigos asociadas a los alumnos.`,
				'Los grupos y sus códigos de acceso se conservan (el marcador se recalcula).',
				`Se conservan los ejercicios y sus soluciones, las ${preview.rounds} competiciones y la configuración.`,
			];
		case 'both':
			return [
				`Se eliminarán ${preview.groups} grupos y ${preview.students} alumnos, junto con sus códigos de acceso.`,
				`También se eliminarán ${preview.submissions} resoluciones del juego de códigos y todo el historial de puntuación asociado (${preview.scoringEvents} eventos, ${preview.propertyScores} propiedades, ${preview.groupAttempts} intentos, ${preview.participants} participaciones y ${preview.groupSessions} sesiones).`,
				`Se conservan los ejercicios y sus soluciones, las ${preview.rounds} competiciones y la configuración.`,
			];
	}
}

interface PurgeActionProps {
	definition: PurgeDefinition;
	preview: PurgePreview;
	disabled: boolean;
	onSuccess: (result: PurgeResult) => void;
	onError: (message: string) => void;
}

/** Botón de peligro con diálogo que exige escribir la frase de confirmación. */
function PurgeAction({ definition, preview, disabled, onSuccess, onError }: PurgeActionProps) {
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState('');
	const [busy, setBusy] = useState(false);
	const [dialogError, setDialogError] = useState<string | null>(null);

	const matches = typed.trim() === definition.confirmation;
	const summary = scopeSummary(definition.scope, preview);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !busy) setOpen(false);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, busy]);

	function close() {
		if (busy) return;
		setOpen(false);
		setTyped('');
		setDialogError(null);
	}

	async function confirm() {
		if (!matches || busy) return;
		setBusy(true);
		setDialogError(null);
		try {
			const result = await purgeEntities(definition.scope, definition.confirmation);
			setOpen(false);
			setTyped('');
			onSuccess(result);
		} catch (err) {
			setDialogError(err instanceof Error ? err.message : 'No se pudo completar la operación.');
			onError(err instanceof Error ? err.message : 'No se pudo completar la operación.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<button
				type="button"
				disabled={disabled}
				className="btn border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
				onClick={() => {
					setDialogError(null);
					setTyped('');
					setOpen(true);
				}}
			>
				{definition.label}
			</button>

			{open && (
				<div
					className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4"
					role="dialog"
					aria-modal="true"
					aria-label={definition.title}
					onClick={(event) => {
						if (event.currentTarget === event.target) close();
					}}
				>
					<div className="card w-full max-w-lg animate-pop p-6">
						<h3 className="text-base font-semibold text-slate-900">{definition.title}</h3>

						<ul className="mt-3 space-y-2 text-sm text-slate-600">
							{summary.map((line) => (
								<li key={line} className="flex gap-2">
									<span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" aria-hidden="true" />
									<span>{line}</span>
								</li>
							))}
						</ul>

						<p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
							Esta acción no se puede deshacer. Las puntuaciones históricas por grupo o alumno no
							pueden conservarse sin la entidad a la que pertenecen.
						</p>

						<div className="mt-4">
							<label className="label" htmlFor={`purge-confirm-${definition.scope}`}>
								Escribe <strong className="font-mono">{definition.confirmation}</strong> para confirmar
							</label>
							<input
								id={`purge-confirm-${definition.scope}`}
								className="input font-mono"
								value={typed}
								onChange={(event) => setTyped(event.target.value)}
								autoComplete="off"
								spellCheck={false}
								disabled={busy}
								placeholder={definition.confirmation}
							/>
						</div>

						{dialogError && (
							<div className="mt-3">
								<ErrorMessage>{dialogError}</ErrorMessage>
							</div>
						)}

						<div className="mt-5 flex flex-wrap justify-end gap-2">
							<button type="button" className="btn-secondary" onClick={close} disabled={busy}>
								Cancelar
							</button>
							<button
								type="button"
								className="btn-danger"
								disabled={!matches || busy}
								onClick={() => void confirm()}
							>
								{busy ? 'Eliminando…' : definition.label}
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

/** Resultado legible tras una purga. */
function resultMessage(result: PurgeResult): string {
	const parts: string[] = [];
	if (result.groupsDeleted > 0) {
		parts.push(`${result.groupsDeleted} ${result.groupsDeleted === 1 ? 'grupo' : 'grupos'}`);
	}
	if (result.studentsDeleted > 0) {
		parts.push(`${result.studentsDeleted} ${result.studentsDeleted === 1 ? 'alumno' : 'alumnos'}`);
	}
	if (result.submissionsDeleted > 0) {
		parts.push(
			`${result.submissionsDeleted} ${result.submissionsDeleted === 1 ? 'resolución' : 'resoluciones'}`,
		);
	}
	const base = parts.length > 0 ? `Eliminados: ${parts.join(', ')}.` : 'No había datos que eliminar.';
	const recomputed =
		result.groupsRecomputed > 0
			? ` Se recalcularon ${result.groupsRecomputed} ${
					result.groupsRecomputed === 1 ? 'marcador' : 'marcadores'
				}.`
			: '';
	return base + recomputed;
}

/**
 * Mantenimiento de datos: acciones masivas de limpieza (datos de prueba).
 *
 * Cada acción exige confirmación escrita y se ejecuta exclusivamente en el
 * servidor. Conserva ejercicios, soluciones, competiciones y configuración.
 */
export default function DataMaintenancePanel() {
	const { data: preview, error, loading, reload } = useAsync(getPurgePreview, []);
	const [notice, setNotice] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	if (loading) return <Spinner />;
	if (!preview) return <ErrorMessage>{error ?? 'No se pudo cargar el resumen de datos.'}</ErrorMessage>;

	const empty = preview.groups === 0 && preview.students === 0;

	function handleSuccess(result: PurgeResult) {
		setActionError(null);
		setNotice(resultMessage(result));
		reload();
	}

	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-lg font-semibold text-slate-900">Mantenimiento de datos</h2>
				<p className="text-sm text-slate-500">
					Acciones masivas para limpiar datos de prueba. Solo para administradores y ejecutadas
					íntegramente en el servidor dentro de una transacción.
				</p>
			</div>

			{notice && <SuccessMessage>{notice}</SuccessMessage>}
			{actionError && <ErrorMessage>{actionError}</ErrorMessage>}

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div className="card p-4">
					<p className="text-xs font-medium uppercase tracking-wide text-slate-400">Grupos</p>
					<p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{preview.groups}</p>
				</div>
				<div className="card p-4">
					<p className="text-xs font-medium uppercase tracking-wide text-slate-400">Alumnos</p>
					<p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{preview.students}</p>
				</div>
				<div className="card p-4">
					<p className="text-xs font-medium uppercase tracking-wide text-slate-400">
						Resoluciones (códigos)
					</p>
					<p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{preview.submissions}</p>
				</div>
				<div className="card p-4">
					<p className="text-xs font-medium uppercase tracking-wide text-slate-400">
						Competiciones (se conservan)
					</p>
					<p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{preview.rounds}</p>
				</div>
			</div>

			<div className="card space-y-4 p-5">
				<InfoMessage>
					Nunca se eliminan los ejercicios, las soluciones de referencia, las competiciones
					registradas, la configuración ni las cuentas de administración. El historial de puntuación
					por grupo o alumno (puntuaciones CSS, eventos, intentos, participantes, sesiones y
					resoluciones del juego de códigos) no puede sobrevivir sin la entidad a la que pertenece,
					así que se elimina con ella y se avisa en la confirmación.
				</InfoMessage>

				{empty ? (
					<InfoMessage>No hay grupos ni alumnos que eliminar.</InfoMessage>
				) : (
					<div className="flex flex-wrap gap-2">
						{PURGE_SCOPES.map((scope) => {
							const definition = PURGE_ACTIONS[scope];
							const disabled =
								(scope === 'groups' && preview.groups === 0) ||
								(scope === 'students' && preview.students === 0) ||
								(scope === 'both' && preview.groups === 0 && preview.students === 0);
							return (
								<PurgeAction
									key={scope}
									definition={definition}
									preview={preview}
									disabled={disabled}
									onSuccess={handleSuccess}
									onError={setActionError}
								/>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
