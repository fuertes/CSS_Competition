'use client';

import { useMemo, useState, type SubmitEvent } from 'react';
import type { GroupAccessCode, GroupRow, GroupScoreRow } from '@/types';
import {
	createGroup,
	deleteGroup,
	generateGroupAccessCode,
	listGroupAccessCodes,
	listGroups,
	listGroupScores,
	listStudents,
	updateGroup,
} from '@/lib/data/admin';
import { formatPoints } from '@/lib/format';
import { ConfirmButton, ErrorMessage, InfoMessage, Spinner, SuccessMessage, useAsync } from './AdminUI';

interface ScoreMap {
	[key: string]: GroupScoreRow | undefined;
}

const PALETTE = [
	'#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899',
	'#8b5cf6', '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#a855f7',
];

interface GroupFormState {
	name: string;
	color: string;
	active: boolean;
}

const emptyForm = (): GroupFormState => ({ name: '', color: PALETTE[0] ?? '#6366f1', active: true });

/** Gestión de grupos: crear, editar, archivar y eliminar. */
export default function GroupsManager() {
	const { data, error, loading, reload } = useAsync(async () => {
		const [groupList, studentList, scoreList, codeList] = await Promise.all([
			listGroups(),
			listStudents(),
			listGroupScores(),
			listGroupAccessCodes(),
		]);
		const scores: ScoreMap = {};
		for (const score of scoreList) scores[score.group_id] = score;
		const accessCodes = new Map<string, GroupAccessCode>();
		for (const entry of codeList) accessCodes.set(entry.groupId, entry);
		return { groups: groupList, students: studentList, scores, accessCodes };
	}, []);

	const [form, setForm] = useState<GroupFormState | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [accessCode, setAccessCode] = useState<{ groupName: string; code: string } | null>(null);
	const [codeCopied, setCodeCopied] = useState(false);
	const [copiedGroupId, setCopiedGroupId] = useState<string | null>(null);

	const membersByGroup = useMemo(() => {
		const map = new Map<string, number>();
		for (const student of data?.students ?? []) {
			if (!student.group_id) continue;
			map.set(student.group_id, (map.get(student.group_id) ?? 0) + 1);
		}
		return map;
	}, [data]);

	if (loading) return <Spinner />;
	if (!data) return <ErrorMessage>{error ?? 'No se pudieron cargar los grupos.'}</ErrorMessage>;

	async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!form) return;
		setBusy(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			if (editingId) {
				await updateGroup(editingId, form);
				setNotice('Grupo actualizado.');
			} else {
				await createGroup(form);
				setNotice('Grupo creado.');
			}
			setForm(null);
			setEditingId(null);
			reload();
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo guardar el grupo.');
		} finally {
			setBusy(false);
		}
	}

	const startEdit = (group: GroupRow) => {
		setEditingId(group.id);
		setForm({ name: group.name, color: group.color, active: group.active });
		setErrorMessage(null);
	};

	async function handleGenerateAccessCode(group: GroupRow) {
		setErrorMessage(null);
		setNotice(null);
		setAccessCode(null);
		setCodeCopied(false);
		try {
			const code = await generateGroupAccessCode(group.id);
			setAccessCode({ groupName: group.name, code });
			reload();
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo generar el código de acceso.');
		}
	}

	async function copyAccessCode() {
		if (!accessCode) return;
		try {
			await navigator.clipboard.writeText(accessCode.code);
			setCodeCopied(true);
			window.setTimeout(() => setCodeCopied(false), 1600);
		} catch {
			setCodeCopied(false);
		}
	}

	async function copyGroupCode(groupId: string, code: string) {
		try {
			await navigator.clipboard.writeText(code);
			setCopiedGroupId(groupId);
			window.setTimeout(
				() => setCopiedGroupId((current) => (current === groupId ? null : current)),
				1600,
			);
		} catch {
			setCopiedGroupId(null);
		}
	}

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold text-slate-900">Grupos</h2>
					<p className="text-sm text-slate-500">
						Crea los equipos de la competición. Cada grupo recibe un código único
						de 5 caracteres, visible para el profesor.
					</p>
				</div>
				{!form && (
					<button
						type="button"
						className="btn-primary"
						onClick={() => {
							setForm(emptyForm());
							setEditingId(null);
							setErrorMessage(null);
						}}
					>
						Nuevo grupo
					</button>
				)}
			</div>

			{notice && <SuccessMessage>{notice}</SuccessMessage>}
			{errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}

			{accessCode && (
				<div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-4" role="status">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<p className="text-sm font-semibold text-brand-900">
								Código de acceso de «{accessCode.groupName}»
							</p>
							<p className="mt-0.5 text-xs text-brand-700">
								Puedes consultarlo y copiarlo siempre que quieras en la lista de grupos.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<code className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 font-mono text-lg font-bold tracking-[0.3em] text-brand-800">
								{accessCode.code}
							</code>
							<button type="button" className="btn-secondary text-sm" onClick={() => void copyAccessCode()}>
								{codeCopied ? '¡Copiado!' : 'Copiar'}
							</button>
						</div>
					</div>
				</div>
			)}

			{form && (
				<form onSubmit={handleSubmit} className="card animate-slide-up space-y-4 p-5">
					<h3 className="text-sm font-semibold text-slate-900">
						{editingId ? 'Editar grupo' : 'Nuevo grupo'}
					</h3>
					<div className="grid gap-4 sm:grid-cols-3">
						<div className="sm:col-span-1">
							<label className="label" htmlFor="group-name">
								Nombre
							</label>
							<input
								id="group-name"
								className="input"
								value={form.name}
								onChange={(event) => setForm({ ...form, name: event.target.value })}
								required
								maxLength={60}
							/>
						</div>
						<div>
							<label className="label" htmlFor="group-color">
								Color
							</label>
							<div className="flex items-center gap-2">
								<input
									id="group-color"
									type="color"
									className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300"
									value={form.color}
									onChange={(event) => setForm({ ...form, color: event.target.value })}
								/>
								<div className="flex flex-wrap gap-1">
									{PALETTE.map((color) => (
										<button
											key={color}
											type="button"
											title={color}
											aria-label={`Usar color ${color}`}
											className="h-6 w-6 rounded-full border border-slate-300 transition hover:scale-110"
											style={{ backgroundColor: color }}
											onClick={() => setForm({ ...form, color })}
										/>
									))}
								</div>
							</div>
						</div>
						<div>
							<label className="label" htmlFor="group-active">
								Estado
							</label>
							<select
								id="group-active"
								className="input"
								value={form.active ? 'active' : 'inactive'}
								onChange={(event) => setForm({ ...form, active: event.target.value === 'active' })}
							>
								<option value="active">Activo</option>
								<option value="inactive">Inactivo</option>
							</select>
						</div>
					</div>
					<div className="flex flex-wrap items-center justify-end gap-2">
						<button
							type="button"
							className="btn-secondary"
							onClick={() => {
								setForm(null);
								setEditingId(null);
							}}
						>
							Cancelar
						</button>
						<button type="submit" className="btn-primary" disabled={busy}>
							{busy ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear grupo'}
						</button>
					</div>
				</form>
			)}

			{data.groups.length === 0 ? (
				<div className="card">
					<InfoMessage>Todavía no hay grupos. Crea el primero para empezar.</InfoMessage>
				</div>
			) : (
				<div className="card overflow-hidden p-0">
					<ul className="divide-y divide-slate-100">
						{data.groups.map((group) => {
							const score = data.scores[group.id];
							const members = membersByGroup.get(group.id) ?? 0;
							const access = data.accessCodes.get(group.id);
							return (
								<li
									key={group.id}
									className={[
										'flex flex-wrap items-center gap-3 px-5 py-4',
										!group.active && 'opacity-60',
									].join(' ')}
								>
									<span
										className="h-4 w-4 shrink-0 rounded-full"
										style={{ backgroundColor: group.color }}
										aria-hidden="true"
									/>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-semibold text-slate-900">{group.name}</p>
										<p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
											<span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
												Código público
												<code className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-widest text-slate-700">
													{group.code}
												</code>
											</span>
											<span>
												{members} {members === 1 ? 'miembro' : 'miembros'}
											</span>
											<span>· {group.active ? 'activo' : 'inactivo'}</span>
										</p>
										{access && access.code ? (
											<p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
												<span className="text-[11px] text-slate-400">Código de acceso</span>
												<code className="rounded-lg border border-brand-300 bg-brand-50 px-2 py-0.5 font-mono text-sm font-bold tracking-[0.2em] text-brand-800">
													{access.code}
												</code>
												<button
													type="button"
													className="btn-secondary px-2 py-0.5 text-[11px]"
													aria-label={`Copiar el código de acceso de ${group.name}`}
													onClick={() => void copyGroupCode(group.id, access.code as string)}
												>
													{copiedGroupId === group.id ? '¡Copiado!' : 'Copiar código'}
												</button>
											</p>
										) : group.has_access_code ? (
											<p className="mt-1 text-[11px] text-amber-600">
												Código de acceso no recuperable (anterior a la recuperación). Vuelve a
												generarlo para poder consultarlo.
											</p>
										) : (
											<p className="mt-1 text-[11px] text-slate-400">Sin código de acceso.</p>
										)}
									</div>
									<div className="text-right">
										<p className="text-sm font-bold tabular-nums text-slate-900">
											{formatPoints(score?.total_points ?? 0)}
										</p>
										<p className="text-[11px] text-slate-400 uppercase">puntos</p>
									</div>
									<div className="flex items-center gap-2">
										<ConfirmButton
											label={group.has_access_code ? 'Regenerar código' : 'Código de acceso'}
											description={
												group.has_access_code
													? 'Se generará un código nuevo y se invalidarán las sesiones activas del grupo. Podrás consultarlo en la lista.'
													: 'Se generará un código de acceso para que el grupo entre en la competición CSS. Podrás consultarlo y copiarlo en la lista.'
											}
											confirmLabel="Generar"
											variant="secondary"
											onConfirm={() => handleGenerateAccessCode(group)}
										/>
										<button type="button" className="btn-secondary" onClick={() => startEdit(group)}>
											Editar
										</button>
										<ConfirmButton
											label={group.active ? 'Archivar' : 'Reactivar'}
											description={
												group.active
													? 'El grupo dejará de aparecer como activo en la competición. Sus puntos se conservan.'
													: 'El grupo volverá a estar activo en la competición.'
											}
											confirmLabel="Confirmar"
											variant="secondary"
											onConfirm={async () => {
												await updateGroup(group.id, { active: !group.active });
												reload();
											}}
										/>
										<ConfirmButton
											label="Eliminar"
											description="El grupo se eliminará definitivamente. Si tiene alumnos asignados o resoluciones registradas, la operación será rechazada por la base de datos."
											onConfirm={async () => {
												await deleteGroup(group.id);
												reload();
											}}
										/>
									</div>
								</li>
							);
						})}
					</ul>
				</div>
			)}
		</div>
	);
}