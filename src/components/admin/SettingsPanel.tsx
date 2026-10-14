'use client';

import { useState, type SubmitEvent } from 'react';
import { getSettings, updateSettings } from '@/lib/data/admin';
import type { CompetitionSettingsRow } from '@/types';
import { ErrorMessage, Spinner, SuccessMessage, useAsync } from './AdminUI';

/** Configuración general de la competición. */
export default function SettingsPanel() {
	const { data, error, loading, reload } = useAsync(getSettings, []);
	const [draft, setDraft] = useState<CompetitionSettingsRow | null>(null);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	if (loading) return <Spinner />;
	if (!data) return <ErrorMessage>{error ?? 'No se pudo cargar la configuración.'}</ErrorMessage>;

	const settings = draft ?? data;

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			await updateSettings(settings);
			setNotice('Configuración guardada.');
			setDraft(null);
			reload();
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo guardar la configuración.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold text-slate-900">Configuración de la competición</h2>
					<p className="text-sm text-slate-500">Ajustes generales de la competición completa.</p>
				</div>
				{draft ? (
					<button type="button" className="btn-secondary" onClick={() => setDraft(null)} disabled={busy}>
						Cancelar edición
					</button>
				) : (
					<button type="button" className="btn-primary" onClick={() => setDraft({ ...data })}>
						Editar
					</button>
				)}
			</div>

			{notice && <SuccessMessage>{notice}</SuccessMessage>}
			{errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}

			<div className="card space-y-4 p-5">
				<div className="grid gap-4 sm:grid-cols-2">
					<div>
						<label className="label" htmlFor="settings-name">
							Nombre de la competición
						</label>
						<input
							id="settings-name"
							className="input"
							value={settings.name}
							onChange={(event) => setDraft({ ...settings, name: event.target.value })}
							disabled={!draft}
							required
							maxLength={80}
						/>
					</div>
					<div>
						<label className="label" htmlFor="settings-points">
							Puntos por defecto por ejercicio
						</label>
						<input
							id="settings-points"
							type="number"
							min={1}
							className="input"
							value={settings.default_points}
							onChange={(event) =>
								setDraft({ ...settings, default_points: Number(event.target.value) })
							}
							disabled={!draft}
							required
						/>
						<p className="mt-1 text-xs text-slate-400">
							Se usa al crear ejercicios nuevos. La puntuación ya otorgada no cambia retroactivamente.
						</p>
					</div>
				</div>

				<fieldset className="space-y-3 rounded-xl border border-slate-200 p-4" disabled={!draft}>
					<legend className="px-1 text-sm font-semibold text-slate-900">Asignaciones</legend>
					<label className="flex cursor-pointer items-start gap-3">
						<input
							type="checkbox"
							className="mt-0.5 h-4 w-4 accent-brand-600"
							checked={settings.assignments_locked_by_default}
							onChange={(event) =>
								setDraft({ ...settings, assignments_locked_by_default: event.target.checked })
							}
						/>
						<span>
							<span className="block text-sm font-medium text-slate-800">
								Bloquear asignaciones al confirmarlas
							</span>
							<span className="block text-xs text-slate-500">
								Aplica a las asignaciones que se confirmen a partir de ahora.
							</span>
						</span>
					</label>
					<label className="flex cursor-pointer items-start gap-3">
						<input
							type="checkbox"
							className="mt-0.5 h-4 w-4 accent-rose-600"
							checked={settings.allow_admin_assignment_correction}
							onChange={(event) =>
								setDraft({ ...settings, allow_admin_assignment_correction: event.target.checked })
							}
						/>
						<span>
							<span className="block text-sm font-medium text-slate-800">
								Permitir correcciones excepcionales de asignaciones
							</span>
							<span className="block text-xs text-rose-600">
								Desactivado por defecto. Cada corrección exige un motivo, confirmación y queda
								registrada en auditoría.
							</span>
						</span>
					</label>
				</fieldset>

				<fieldset className="space-y-3 rounded-xl border border-slate-200 p-4" disabled={!draft}>
					<legend className="px-1 text-sm font-semibold text-slate-900">
						Límite de intentos de códigos
					</legend>
					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<label className="label" htmlFor="settings-attempts">
								Intentos fallidos permitidos
							</label>
							<input
								id="settings-attempts"
								type="number"
								min={1}
								className="input"
								value={settings.submission_max_attempts}
								onChange={(event) =>
									setDraft({ ...settings, submission_max_attempts: Number(event.target.value) })
								}
								disabled={!draft}
								required
							/>
						</div>
						<div>
							<label className="label" htmlFor="settings-window">
								Ventana de tiempo (segundos)
							</label>
							<input
								id="settings-window"
								type="number"
								min={10}
								className="input"
								value={settings.submission_window_seconds}
								onChange={(event) =>
									setDraft({ ...settings, submission_window_seconds: Number(event.target.value) })
								}
								disabled={!draft}
								required
							/>
						</div>
					</div>
				</fieldset>

				<fieldset className="space-y-3 rounded-xl border border-slate-200 p-4" disabled={!draft}>
					<legend className="px-1 text-sm font-semibold text-slate-900">Competición CSS</legend>
					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<label className="label" htmlFor="settings-css-attempts">
								Intentos de acceso de grupo permitidos
							</label>
							<input
								id="settings-css-attempts"
								type="number"
								min={1}
								className="input"
								value={settings.css_login_max_attempts}
								onChange={(event) =>
									setDraft({ ...settings, css_login_max_attempts: Number(event.target.value) })
								}
								disabled={!draft}
								required
							/>
							<p className="mt-1 text-xs text-slate-400">
								Intentos fallidos por código antes de bloquear temporalmente.
							</p>
						</div>
						<div>
							<label className="label" htmlFor="settings-css-window">
								Ventana de acceso (segundos)
							</label>
							<input
								id="settings-css-window"
								type="number"
								min={10}
								className="input"
								value={settings.css_login_window_seconds}
								onChange={(event) =>
									setDraft({ ...settings, css_login_window_seconds: Number(event.target.value) })
								}
								disabled={!draft}
								required
							/>
						</div>
						<div>
							<label className="label" htmlFor="settings-css-bonus-points">
								Bonificación por velocidad (puntos)
							</label>
							<input
								id="settings-css-bonus-points"
								type="number"
								min={0}
								className="input"
								value={settings.css_speed_bonus_points}
								onChange={(event) =>
									setDraft({ ...settings, css_speed_bonus_points: Number(event.target.value) })
								}
								disabled={!draft}
								required
							/>
							<p className="mt-1 text-xs text-slate-400">
								0 desactiva la bonificación por velocidad.
							</p>
						</div>
						<div>
							<label className="label" htmlFor="settings-css-bonus-seconds">
								Bonificación por velocidad (umbral en segundos)
							</label>
							<input
								id="settings-css-bonus-seconds"
								type="number"
								min={0}
								className="input"
								value={settings.css_speed_bonus_seconds}
								onChange={(event) =>
									setDraft({ ...settings, css_speed_bonus_seconds: Number(event.target.value) })
								}
								disabled={!draft}
								required
							/>
							<p className="mt-1 text-xs text-slate-400">
								Se concede una vez por selector si se completa dentro de este tiempo.
							</p>
						</div>
					</div>
				</fieldset>

				<fieldset className="space-y-4 rounded-xl border border-slate-200 p-4" disabled={!draft}>
					<legend className="px-1 text-sm font-semibold text-slate-900">Sistema de puntuación</legend>
					<p className="text-xs text-slate-500">
						Define cómo se conceden puntos por propiedad correcta y cómo se penalizan los errores de
						CSS. La puntuación se calcula siempre en el servidor.
					</p>

					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<label className="label" htmlFor="settings-css-points">
								Puntos base por propiedad correcta
							</label>
							<input
								id="settings-css-points"
								type="number"
								min={1}
								className="input"
								value={settings.css_points_per_property}
								onChange={(event) =>
									setDraft({ ...settings, css_points_per_property: Number(event.target.value) })
								}
								disabled={!draft}
								required
							/>
							<p className="mt-1 text-xs text-slate-400">
								Valor inicial de las reglas CSS nuevas (importador y alta manual). Las reglas ya
								creadas conservan sus puntos para no alterar puntuaciones registradas.
							</p>
						</div>
						<div>
							<label className="label" htmlFor="settings-penalty-points">
								Penalización por errores de CSS (puntos)
							</label>
							<input
								id="settings-penalty-points"
								type="number"
								min={0}
								className="input"
								value={settings.penalty_points}
								onChange={(event) =>
									setDraft({ ...settings, penalty_points: Number(event.target.value) })
								}
								disabled={!draft}
								required
							/>
							<p className="mt-1 text-xs text-slate-400">
								Puntos descontados según el modo elegido. 0 desactiva el descuento aunque la
								penalización esté activada.
							</p>
						</div>
					</div>

					<div>
						<label className="label" htmlFor="settings-penalty-mode">
							Modo de aplicación de la penalización
						</label>
						<select
							id="settings-penalty-mode"
							className="input"
							value={settings.penalty_mode}
							onChange={(event) =>
								setDraft({
									...settings,
									penalty_mode: event.target.value as CompetitionSettingsRow['penalty_mode'],
								})
							}
							disabled={!draft}
						>
							<option value="per_property">Por cada propiedad incorrecta</option>
							<option value="per_submission">Una vez por entrega con errores</option>
						</select>
						<p className="mt-2 text-xs text-slate-500">
							<strong>Por cada propiedad incorrecta:</strong> descuenta los puntos configurados por
							cada propiedad reconocida con valor distinto del esperado en la entrega.
						</p>
						<p className="mt-1 text-xs text-slate-500">
							<strong>Una vez por entrega con errores:</strong> descuenta los puntos configurados una
							sola vez si la entrega contiene al menos una propiedad incorrecta. Es más indulgente
							con entregas incompletas.
						</p>
					</div>

					<div className="space-y-3">
						<label className="flex cursor-pointer items-start gap-3">
							<input
								type="checkbox"
								className="mt-0.5 h-4 w-4 accent-rose-600"
								checked={settings.penalty_enabled}
								onChange={(event) =>
									setDraft({ ...settings, penalty_enabled: event.target.checked })
								}
							/>
							<span>
								<span className="block text-sm font-medium text-slate-800">
									Activar la penalización por errores
								</span>
								<span className="block text-xs text-slate-500">
									Desactivada por defecto. Los errores de sintaxis y las entregas no evaluables
									nunca penalizan.
								</span>
							</span>
						</label>
						<label className="flex cursor-pointer items-start gap-3">
							<input
								type="checkbox"
								className="mt-0.5 h-4 w-4 accent-brand-600"
								checked={settings.allow_negative_score}
								onChange={(event) =>
									setDraft({ ...settings, allow_negative_score: event.target.checked })
								}
							/>
							<span>
								<span className="block text-sm font-medium text-slate-800">
									Permitir puntuación negativa
								</span>
								<span className="block text-xs text-slate-500">
									{settings.allow_negative_score
										? 'Sin límite mínimo: la penalización puede dejar el saldo del grupo por debajo de cero.'
										: 'Puntuación mínima 0: la penalización nunca deja el saldo por debajo de cero.'}
								</span>
							</span>
						</label>
					</div>
				</fieldset>
			</div>

			{draft && (
				<div className="flex justify-end">
					<button type="submit" className="btn-primary" disabled={busy}>
						{busy ? 'Guardando…' : 'Guardar configuración'}
					</button>
				</div>
			)}
		</form>
	);
}