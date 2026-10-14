'use client';

import { useMemo, useState, type SubmitEvent } from 'react';
import {
	DndContext,
	DragOverlay,
	closestCorners,
	KeyboardSensor,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { GroupRow, StudentRow } from '@/types';
import {
	clearAssignment,
	confirmAssignment,
	correctAssignment,
	getSettings,
	listGroups,
	listStudents,
} from '@/lib/data/admin';
import { ErrorMessage, InfoMessage, Spinner, SuccessMessage, useAsync } from './AdminUI';

interface GroupColumnProps {
	group: GroupRow;
	members: StudentRow[];
	allGroups: GroupRow[];
	allowCorrection: boolean;
	onMove: (studentId: string, groupId: string) => void;
	onUnassign: (student: StudentRow) => void;
	onCorrect: (student: StudentRow) => void;
}

function GroupColumn({
	group,
	members,
	allGroups,
	allowCorrection,
	onMove,
	onUnassign,
	onCorrect,
}: GroupColumnProps) {
	const { isOver, setNodeRef } = useDroppable({ id: `group-${group.id}` });
	const otherGroups = allGroups.filter((candidate) => candidate.id !== group.id);

	return (
		<div
			ref={setNodeRef}
			className={[
				'flex min-h-48 w-64 shrink-0 flex-col rounded-2xl border bg-white transition',
				isOver ? 'border-brand-400 ring-2 ring-brand-200' : 'border-slate-200',
			].join(' ')}
		>
			<div
				className="flex items-center justify-between gap-2 rounded-t-2xl border-b border-slate-100 px-3 py-2.5"
				style={{ backgroundColor: `${group.color}14` }}
			>
				<p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
					<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
					{group.name}
				</p>
				<span className="badge bg-white text-slate-600">{members.length}</span>
			</div>
			<ul className="flex-1 space-y-1.5 p-2">
				{members.map((student) => (
					<li key={student.id} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5">
						<div className="flex items-center justify-between gap-2">
							<p className="truncate text-xs font-medium text-slate-800">
								{student.name}
								{!student.active && <span className="ml-1 text-slate-400">(inactivo)</span>}
							</p>
							{student.assignment_locked ? (
								<div className="flex shrink-0 items-center gap-1">
									<svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-slate-400" fill="currentColor" aria-label="asignación bloqueada">
										<path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" />
									</svg>
									{allowCorrection && (
										<button
											type="button"
											className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-white"
											onClick={() => onCorrect(student)}
										>
											Corregir
										</button>
									)}
								</div>
							) : (
								<div className="flex shrink-0 items-center gap-1">
									{otherGroups.length > 0 && (
										<select
											aria-label={`Mover a ${student.name} a otro grupo`}
											className="h-6 max-w-24 rounded border border-slate-300 text-[10px] text-slate-600"
											value=""
											onChange={(event) => {
												if (event.target.value) onMove(student.id, event.target.value);
											}}
										>
											<option value="">Mover…</option>
											{otherGroups.map((candidate) => (
												<option key={candidate.id} value={candidate.id}>
													{candidate.name}
												</option>
											))}
										</select>
									)}
									<button
										type="button"
										title="Quitar del grupo"
										aria-label={`Quitar a ${student.name} del grupo`}
										className="grid h-6 w-6 place-items-center rounded border border-slate-300 text-[10px] text-slate-500 hover:bg-white"
										onClick={() => onUnassign(student)}
									>
										✕
									</button>
								</div>
							)}
						</div>
					</li>
				))}
				{members.length === 0 && (
					<li className="rounded-lg border border-dashed border-slate-200 px-2.5 py-3 text-center text-xs text-slate-400">
						Suelta alumnos aquí
					</li>
				)}
			</ul>
		</div>
	);
}

function DraggableStudentCard({ student }: { student: StudentRow }) {
	const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
		id: `student-${student.id}`,
		disabled: student.assignment_locked,
	});
	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform) }}
			className={[
				'flex cursor-grab touch-none items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2.5 shadow-sm transition active:cursor-grabbing',
				isDragging ? 'border-brand-400 opacity-70' : 'border-slate-200',
				student.assignment_locked && 'cursor-not-allowed opacity-50',
			].join(' ')}
			{...attributes}
			{...listeners}
		>
			<p className="truncate text-sm font-medium text-slate-800">{student.name}</p>
			<svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-300" fill="currentColor" aria-hidden="true">
				<path d="M8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-8 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-8 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
			</svg>
		</div>
	);
}

/** Tablero de asignaciones con drag & drop y alternativa accesible por teclado. */
export default function AssignmentsBoard() {
	const { data, error, loading, reload } = useAsync(async () => {
		const [studentList, groupList] = await Promise.all([listStudents(), listGroups()]);
		const settings = await getSettings();
		return {
			students: studentList,
			groups: groupList,
			allowCorrection: settings?.allow_admin_assignment_correction ?? false,
		};
	}, []);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	const [query, setQuery] = useState('');
	const [activeId, setActiveId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [correctionTarget, setCorrectionTarget] = useState<StudentRow | null>(null);
	const [correctionGroup, setCorrectionGroup] = useState('');
	const [correctionReason, setCorrectionReason] = useState('');

	const activeStudent = useMemo(
		() => (activeId ? data?.students.find((student) => student.id === activeId) : undefined),
		[activeId, data],
	);

	if (loading) return <Spinner />;
	if (!data) return <ErrorMessage>{error ?? 'No se pudieron cargar los datos.'}</ErrorMessage>;
	const boardData = data;

	const q = query.trim().toLowerCase();
	const filteredStudents = data.students.filter(
		(student) => !q || student.name.toLowerCase().includes(q),
	);
	const unassigned = filteredStudents.filter((student) => !student.group_id);
	const membersByGroup = (group: GroupRow) =>
		filteredStudents.filter((student) => student.group_id === group.id);

	async function runMutation(action: () => Promise<void>, successMessage: string) {
		setBusy(true);
		setErrorMessage(null);
		setNotice(null);
		try {
			await action();
			setNotice(successMessage);
			reload();
		} catch (err) {
			setErrorMessage(err instanceof Error ? err.message : 'La operación no se pudo completar.');
		} finally {
			setBusy(false);
		}
	}

	async function handleDragEnd(event: DragEndEvent) {
		const studentId = String(event.active.id).replace('student-', '');
		const overId = event.over ? String(event.over.id) : null;
		if (!overId?.startsWith('group-')) return;
		const groupId = overId.replace('group-', '');
		const student = boardData.students.find((item) => item.id === studentId);
		if (!student || student.assignment_locked) return;
		if (student.group_id === groupId) return;
		const targetGroup = boardData.groups.find((group) => group.id === groupId);
		if (!targetGroup) return;
		await runMutation(
			() => confirmAssignment(studentId, groupId),
			`${student.name} asignado a ${targetGroup.name}.`,
		);
	}

	function handleDragStart(event: DragStartEvent) {
		setActiveId(String(event.active.id).replace('student-', ''));
	}

	function handleDragCancel() {
		setActiveId(null);
	}

	function handleMove(studentId: string, groupId: string) {
		const student = boardData.students.find((item) => item.id === studentId);
		const targetGroup = boardData.groups.find((group) => group.id === groupId);
		if (!student) return;
		void runMutation(
			() => confirmAssignment(student.id, groupId),
			`${student.name} asignado a ${targetGroup?.name ?? 'grupo'}.`,
		);
	}

	function handleUnassign(student: StudentRow) {
		void runMutation(() => clearAssignment(student.id), `${student.name} quedó sin grupo.`);
	}

	async function handleCorrect(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!correctionTarget || !correctionGroup) return;
		await runMutation(
			() => correctAssignment(correctionTarget.id, correctionGroup, correctionReason),
			'Asignación corregida y registrada en auditoría.',
		);
		setCorrectionTarget(null);
		setCorrectionGroup('');
		setCorrectionReason('');
	}

	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-lg font-semibold text-slate-900">Asignaciones</h2>
				<p className="text-sm text-slate-500">
					Arrastra los alumnos a un grupo, o usa los desplegables (accesible por teclado con{' '}
					<kbd className="rounded bg-slate-100 px-1">Espacio</kbd> + flechas). Las asignaciones confirmadas
					quedan bloqueadas.
				</p>
			</div>

			{busy && <InfoMessage>Procesando…</InfoMessage>}
			{notice && <SuccessMessage>{notice}</SuccessMessage>}
			{errorMessage && <ErrorMessage>{errorMessage}</ErrorMessage>}

			<div className="card flex flex-wrap items-center gap-3 p-4">
				<div className="min-w-0 flex-1">
					<label className="sr-only" htmlFor="assignment-search">
						Buscar alumnos
					</label>
					<input
						id="assignment-search"
						className="input"
						placeholder="Buscar alumnos…"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<p className="text-sm text-slate-500">{unassigned.length} alumnos sin asignar</p>
			</div>

			<DndContext
				sensors={sensors}
				collisionDetection={closestCorners}
				onDragStart={handleDragStart}
				onDragEnd={(event) => void handleDragEnd(event)}
				onDragCancel={handleDragCancel}
			>
				<div className="flex gap-4 overflow-x-auto pb-4 lg:overflow-x-visible lg:flex-wrap">
					<div className="flex w-64 shrink-0 flex-col gap-2">
						<p className="px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
							Pendientes {unassigned.length}
						</p>
						<div className="space-y-2">
							{unassigned.map((student) => (
								<div key={student.id} className="space-y-1.5">
									<DraggableStudentCard student={student} />
									<select
										aria-label={`Asignar a ${student.name} a un grupo`}
										className="input h-9 py-1 text-xs"
										value=""
										onChange={(event) => {
											if (event.target.value) handleMove(student.id, event.target.value);
										}}
									>
										<option value="">Asignar a grupo…</option>
										{data.groups.map((group) => (
											<option key={group.id} value={group.id}>
												{group.name}
											</option>
										))}
									</select>
								</div>
							))}
							{unassigned.length === 0 && (
								<div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
									Nadie pendiente
								</div>
							)}
						</div>
					</div>

					{data.groups.map((group) => (
						<div key={group.id} className="shrink-0">
							<GroupColumn
								group={group}
								members={membersByGroup(group)}
								allGroups={data.groups}
								allowCorrection={data.allowCorrection}
								onMove={handleMove}
								onUnassign={handleUnassign}
								onCorrect={(student) => {
									setCorrectionTarget(student);
									setCorrectionGroup(student.group_id ?? '');
									setCorrectionReason('');
									setErrorMessage(null);
								}}
							/>
						</div>
					))}
					{data.groups.length === 0 && (
						<div className="flex-1">
							<InfoMessage>Crea primero un grupo para poder asignar alumnos.</InfoMessage>
						</div>
					)}
				</div>

				<DragOverlay>
					{activeStudent && (
						<div className="rounded-xl border border-brand-400 bg-white px-3 py-2.5 shadow-lg">
							<p className="text-sm font-medium text-slate-800">{activeStudent.name}</p>
						</div>
					)}
				</DragOverlay>
			</DndContext>

			{correctionTarget && (
				<div
					className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
					role="dialog"
					aria-modal="true"
					aria-label={`Corrección excepcional de ${correctionTarget.name}`}
					onClick={(event) => {
						if (event.currentTarget === event.target) setCorrectionTarget(null);
					}}
				>
					<form onSubmit={(event) => void handleCorrect(event)} className="card w-full max-w-md animate-pop space-y-4 p-6">
						<h3 className="text-base font-semibold text-slate-900">
							Corrección excepcional de asignación
						</h3>
						<p className="text-sm text-slate-600">
							{correctionTarget.name} tiene una asignación bloqueada. La corrección requiere un motivo y
							queda registrada en la auditoría.
						</p>
						<div>
							<label className="label" htmlFor="correction-group">
								Nuevo grupo
							</label>
							<select
								id="correction-group"
								className="input"
								value={correctionGroup}
								onChange={(event) => setCorrectionGroup(event.target.value)}
							>
								<option value="">Selecciona un grupo…</option>
								{data.groups.map((group) => (
									<option key={group.id} value={group.id}>
										{group.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="label" htmlFor="correction-reason">
								Motivo
							</label>
							<textarea
								id="correction-reason"
								className="input min-h-20"
								value={correctionReason}
								onChange={(event) => setCorrectionReason(event.target.value)}
								required
								maxLength={300}
								placeholder="Explica el motivo de la corrección…"
							/>
						</div>
						<div className="flex justify-end gap-2">
							<button type="button" className="btn-secondary" onClick={() => setCorrectionTarget(null)}>
								Cancelar
							</button>
							<button type="submit" className="btn-danger" disabled={!correctionGroup || correctionReason.trim().length < 3}>
								Confirmar corrección
							</button>
						</div>
					</form>
				</div>
			)}
		</div>
	);
}