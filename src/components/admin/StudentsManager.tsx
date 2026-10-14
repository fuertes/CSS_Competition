'use client';

import { useMemo, useRef, useState, type SubmitEvent } from 'react';
import type { StudentRow } from '@/types';
import { generateAccessCode } from '@/lib/codes';
import {
	confirmAssignment,
	createStudent,
	deleteStudent,
	listGroups,
	listStudents,
	setStudentAccessCode,
	updateStudent,
} from '@/lib/data/admin';
import {
	ConfirmButton,
	ErrorMessage,
	InfoMessage,
	Spinner,
	SuccessMessage,
	useAsync,
} from './AdminUI';

interface CsvResult {
	studentName: string;
	groupName: string;
	code: string;
	codeAssigned: boolean;
}

const CSV_SAMPLE = `name,group,code
Ana García,Fénix,
Luis Pérez,Orbit,ALFA21`;

function parseCsv(text: string): Array<{ name: string; group: string; code: string }> {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
	const rows: Array<{ name: string; group: string; code: string }> = [];
	for (const line of lines) {
		if (line.toLowerCase().startsWith('name,group')) continue;
		const [name = '', group = '', code = ''] = line.split(',').map((value) => value.trim());
		if (!name) continue;
		rows.push({ name, group, code });
	}
	return rows;
}

/** Gestión de alumnos: crear, editar, archivar, importar CSV y códigos. */
export default function StudentsManager() {
	const [groups, setGroups] = useState<Array<{ id: string; name: string; color: string }>>([]);
	const {
		data: students,
		error,
		loading,
		reload,
	} = useAsync(async () => {
		const [studentRows, groupRows] = await Promise.all([listStudents(), listGroups()]);
		setGroups(
			groupRows.map((group) => ({ id: group.id, name: group.name, color: group.color })),
		);
		return studentRows;
	}, []);

	const [query, setQuery] = useState('');
	const [groupFilter, setGroupFilter] = useState('all');
	const [form, setForm] = useState<{ id: string | null; name: string; group_id: string; active: boolean } | null>(null);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [accessTarget, setAccessTarget] = useState<StudentRow | null>(null);
	const [generatedCode, setGeneratedCode] = useState<string | null>(null);
	const [accessBusy, setAccessBusy] = useState(false);

	const fileRef = useRef<HTMLInputElement>(null);
	const [csvSummaries, setCsvSummaries] = useState<CsvResult[]>([]);
	const [importBusy, setImportBusy] = useState(false);

	const filtered = useMemo(() => {
		const list = students ?? [];
		const q = query.trim().toLowerCase();
		return list.filter((student) => {
			if (q && !student.name.toLowerCase().includes(q)) return false;
			if (groupFilter === 'unassigned') return student.group_id === null;
			if (groupFilter !== 'all') return student.group_id === groupFilter;
			return true;
		});
	}, [students, query, groupFilter]);

	if (loading) return <Spinner />;
	if (!students) return <ErrorMessage>{error ?? 'No se pudieron cargar los alumnos.'}</ErrorMessage>;

	const groupName = (student: StudentRow) =>
		groups.find((group) => group.id === student.group_id)?.name ?? null;
	const groupColor = (student: StudentRow) =>
		groups.find((group) => group.id === student.group_id)?.color ?? '#64748b';

	async function handleSave(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!form) return;
		setBusy(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			if (form.id) {
				await updateStudent(form.id, {
					name: form.name,
					group_id: form.group_id || null,
					active: form.active,
				});
				setNotice('Alumno actualizado.');
			} else {
				const id = await createStudent({
					name: form.name,
					group_id: form.group_id || null,
					active: form.active,
				});
				if (form.group_id) {
					await confirmAssignment(id, form.group_id);
				}
				setNotice('Alumno creado.');
			}
			setForm(null);
			reload();
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo guardar el alumno.');
		} finally {
			setBusy(false);
		}
	}

	async function handleSetAccessCode(student: StudentRow) {
		setAccessBusy(true);
		setErrorMessage(null);
		try {
			const code = generateAccessCode(6);
			await setStudentAccessCode(student.id, code);
			setGeneratedCode(code);
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo asignar el código.');
		} finally {
			setAccessBusy(false);
		}
	}

	async function handleCsvImport(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		const file = fileRef.current?.files?.[0];
		if (!file) return;
		setImportBusy(true);
		setErrorMessage(null);
		setCsvSummaries([]);
		try {
			const text = await file.text();
			const rows = parseCsv(text);
			if (rows.length === 0) throw new Error('El CSV no contiene filas válidas.');

			const groupByName = new Map(groups.map((group) => [group.name.toLowerCase(), group]));
			const summaries: CsvResult[] = [];
			const withoutGroup: string[] = [];

			for (const row of rows) {
				const group = groupByName.get(row.group.toLowerCase());
				if (row.group && !group) withoutGroup.push(row.name);
				const id = await createStudent({
					name: row.name,
					group_id: group?.id ?? null,
					active: true,
				});
				if (group) await confirmAssignment(id, group.id);

				const code = row.code.trim() || generateAccessCode(6);
				await setStudentAccessCode(id, code);
				summaries.push({
					studentName: row.name,
					groupName: group?.name ?? '—',
					code,
					codeAssigned: true,
				});
			}

			if (withoutGroup.length > 0) {
				setErrorMessage(
					`Grupos no encontrados en el CSV (se crearon los alumnos sin grupo): ${withoutGroup.join(', ')}`,
				);
			} else {
				setErrorMessage(null);
			}
			setNotice(
				`Importados ${summaries.length} alumnos. Anota los códigos de acceso: se muestran una sola vez.`,
			);
			setCsvSummaries(summaries);
			reload();
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'No se pudo importar el CSV.');
		} finally {
			setImportBusy(false);
		}
	}

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold text-slate-900">Alumnos</h2>
					<p className="text-sm text-slate-500">
						{students.length} alumnos · {students.filter((s) => !s.group_id).length} sin asignar
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						className="btn-primary"
						onClick={() => {
							setForm({ id: null, name: '', group_id: '', active: true });
							setErrorMessage(null);
						}}
					>
						Nuevo alumno
					</button>
				</div>
			</div>

			{importBusy && <Spinner label="Importando…" />}

			<form onSubmit={handleCsvImport} className="card space-y-3 p-5">
				<div className="flex flex-wrap items-end gap-3">
					<div className="min-w-0 flex-1">
						<label className="label" htmlFor="csv-file">
							Importar alumnos desde CSV (columnas: name, group, code)
						</label>
						<input
							id="csv-file"
							ref={fileRef}
							type="file"
							accept=".csv,text/csv"
							className="input file:hidden"
						/>
					</div>
					<button type="submit" className="btn-primary" disabled={importBusy}>
						Importar
					</button>
				</div>
				<pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{CSV_SAMPLE}</pre>
			</form>

			{csvSummaries.length > 0 && (
				<div className="card overflow-hidden p-0">
					<div className="px-5 py-3">
						<h3 className="text-sm font-semibold text-slate-900">
							Códigos de acceso generados (guárdalos ahora)
						</h3>
					</div>
					<ul className="max-h-72 divide-y divide-slate-100 overflow-auto">
						{csvSummaries.map((summary) => (
							<li key={summary.studentName} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
								<span className="truncate text-slate-800">{summary.studentName}</span>
								<span className="text-xs text-slate-400">{summary.groupName}</span>
								<code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold">
									{summary.code}
								</code>
							</li>
						))}
					</ul>
				</div>
			)}

			{notice && <SuccessMessage>{notice}</SuccessMessage>}
			{errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}

			{form && (
				<form onSubmit={handleSave} className="card animate-slide-up space-y-4 p-5">
					<h3 className="text-sm font-semibold text-slate-900">
						{form.id ? 'Editar alumno' : 'Nuevo alumno'}
					</h3>
					<div className="grid gap-4 sm:grid-cols-3">
						<div>
							<label className="label" htmlFor="student-name">
								Nombre
							</label>
							<input
								id="student-name"
								className="input"
								value={form.name}
								onChange={(event) => setForm({ ...form, name: event.target.value })}
								required
								maxLength={80}
							/>
						</div>
						<div>
							<label className="label" htmlFor="student-group">
								Grupo
							</label>
							<select
								id="student-group"
								className="input"
								value={form.group_id}
								onChange={(event) => {
									setForm({ ...form, group_id: event.target.value });
									if (event.target.value) {
										setNotice(
											'Al asignar un grupo se confirmará la asignación y quedará bloqueada.',
										);
									}
								}}
							>
								<option value="">Sin grupo</option>
								{groups.map((group) => (
									<option key={group.id} value={group.id}>
										{group.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="label" htmlFor="student-active">
								Estado
							</label>
							<select
								id="student-active"
								className="input"
								value={form.active ? 'active' : 'inactive'}
								onChange={(event) => setForm({ ...form, active: event.target.value === 'active' })}
							>
								<option value="active">Activo</option>
								<option value="inactive">Inactivo</option>
							</select>
						</div>
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
							{busy ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear alumno'}
						</button>
					</div>
				</form>
			)}

			<div className="card p-4">
				<div className="flex flex-wrap items-center gap-3">
					<div className="min-w-0 flex-1">
						<label className="sr-only" htmlFor="student-search">
							Buscar alumno
						</label>
						<input
							id="student-search"
							className="input"
							placeholder="Buscar por nombre…"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
					</div>
					<label className="sr-only" htmlFor="student-group-filter">
						Filtrar por grupo
					</label>
					<select
						id="student-group-filter"
						className="input sm:max-w-48"
						value={groupFilter}
						onChange={(event) => setGroupFilter(event.target.value)}
					>
						<option value="all">Todos los grupos</option>
						<option value="unassigned">Sin asignar</option>
						{groups.map((group) => (
							<option key={group.id} value={group.id}>
								{group.name}
							</option>
						))}
					</select>
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="card">
					<InfoMessage>No se encontraron alumnos con esos filtros.</InfoMessage>
				</div>
			) : (
				<div className="card overflow-hidden p-0">
					<ul className="divide-y divide-slate-100">
						{filtered.map((student) => (
							<li
								key={student.id}
								className={['flex flex-wrap items-center gap-3 px-5 py-3', !student.active && 'opacity-60'].join(' ')}
							>
								<span
									className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600"
									aria-hidden="true"
								>
									{student.name.slice(0, 2).toUpperCase()}
								</span>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
									<p className="flex items-center gap-1.5 text-xs text-slate-500">
										{student.group_id ? (
											<>
												<span className="h-2 w-2 rounded-full" style={{ backgroundColor: groupColor(student) }} />
												{groupName(student)}
												{student.assignment_locked && ' · bloqueado'}
											</>
										) : (
											<span className="text-amber-600">Pendiente de asignación</span>
										)}
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<button
										type="button"
										className="btn-secondary"
										disabled={accessBusy}
										onClick={() => {
											setAccessTarget(student);
											setGeneratedCode(null);
											setErrorMessage(null);
										}}
									>
										Código de acceso
									</button>
									<button
										type="button"
										className="btn-secondary"
										onClick={() =>
											setForm({
												id: student.id,
												name: student.name,
												group_id: student.group_id ?? '',
												active: student.active,
											})
										}
									>
										Editar
									</button>
									<ConfirmButton
										label="Eliminar"
										description={`Se eliminará a ${student.name}. La base de datos rechazará el borrado si tiene resoluciones registradas.`}
										onConfirm={async () => {
											await deleteStudent(student.id);
											reload();
										}}
									/>
								</div>
							</li>
						))}
					</ul>
				</div>
			)}

			{accessTarget && (
				<div
					className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
					role="dialog"
					aria-modal="true"
					aria-label={`Código de acceso de ${accessTarget.name}`}
					onClick={(event) => {
						if (event.currentTarget === event.target) setAccessTarget(null);
					}}
				>
					<div className="card w-full max-w-md animate-pop p-6 text-center">
						<h3 className="text-base font-semibold text-slate-900">
							Código de acceso de {accessTarget.name}
						</h3>
						{generatedCode ? (
							<>
								<p className="mt-2 text-sm text-slate-600">
									Entrégale este código al alumno. No volverá a mostrarse.
								</p>
								<p className="mt-4 rounded-xl border border-brand-200 bg-brand-50 py-4 font-mono text-3xl font-bold tracking-[0.35em] text-brand-700">
									{generatedCode}
								</p>
								<button
									type="button"
									className="btn-secondary mt-4"
									onClick={() => {
										void navigator.clipboard?.writeText(generatedCode);
									}}
								>
									Copiar
								</button>
							</>
						) : (
							<p className="mt-4 text-sm text-slate-600">
								Se generará un código personal y se guardará de forma segura (cifrado).
							</p>
						)}
						<div className="mt-5 flex justify-center gap-2">
							<button type="button" className="btn-secondary" onClick={() => setAccessTarget(null)}>
								Cerrar
							</button>
							{!generatedCode && (
								<button
									type="button"
									className="btn-primary"
									disabled={accessBusy}
									onClick={() => void handleSetAccessCode(accessTarget)}
								>
									{accessBusy ? 'Generando…' : 'Generar código'}
								</button>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}