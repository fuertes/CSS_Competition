import type { Metadata } from 'next';
import Link from 'next/link';
import StatCard from '@/components/ui/StatCard';
import Alert from '@/components/ui/Alert';
import Card from '@/components/ui/Card';
import { getPool } from '@/lib/db';
import { fetchAdminStats } from '@/lib/data/postgres';
import { toRankingInputs } from '@/lib/data/ranking';
import { rankEntries } from '@/lib/ranking';
import { formatPoints } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: 'Resumen',
};

interface AdminStats {
	students: number;
	groups: number;
	activeExercises: number;
	exerciseWithoutCode: number;
	solved: number;
	pendingAssignments: number;
}

const EMPTY_STATS: AdminStats = {
	students: 0,
	groups: 0,
	activeExercises: 0,
	exerciseWithoutCode: 0,
	solved: 0,
	pendingAssignments: 0,
};

export default async function AdminHomePage() {
	const pool = getPool();

	let stats: AdminStats = EMPTY_STATS;
	let ranking: ReturnType<typeof rankEntries> = [];
	let loadError: string | null = null;

	if (pool) {
		try {
			const { stats: summary, ranking: rankingRows } = await fetchAdminStats(pool);
			stats = summary;
			ranking = rankEntries(toRankingInputs(rankingRows));
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'No se pudo cargar el resumen.';
		}
	} else {
		loadError = 'No se pudo conectar con PostgreSQL.';
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-xl font-bold text-slate-900">Resumen</h1>
				<p className="text-sm text-slate-500">Estado general de la competición.</p>
			</div>

			{loadError && (
				<Alert variant="error" title="Sin conexión">
					{loadError}. Revisa la configuración en <code>.env</code>.
				</Alert>
			)}

			<div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
				<StatCard label="Alumnos" value={stats.students} tone="brand" />
				<StatCard label="Grupos" value={stats.groups} tone="emerald" />
				<StatCard label="Ejercicios activos" value={stats.activeExercises} tone="slate" />
				<StatCard label="Resoluciones válidas" value={stats.solved} tone="amber" />
				<StatCard
					label="Alumnos sin asignar"
					value={stats.pendingAssignments}
					tone="rose"
					hint={stats.pendingAssignments > 0 ? 'Revisa la pestaña Asignaciones' : undefined}
				/>
				<StatCard
					label="Ejercicios sin código"
					value={stats.exerciseWithoutCode}
					tone="slate"
					hint={stats.exerciseWithoutCode > 0 ? 'Ponles un código en Ejercicios' : undefined}
				/>
			</div>

			{stats.exerciseWithoutCode > 0 && (
				<Alert variant="warning" title="Atención">
					Hay {stats.exerciseWithoutCode}{' '}
					{stats.exerciseWithoutCode === 1 ? 'ejercicio activo sin' : 'ejercicios activos sin'} código
					secreto configurado. Los alumnos no podrán resolver{' '}
					{stats.exerciseWithoutCode === 1 ? 'mientras no se configure.' : 'hasta configurarlos.'}
				</Alert>
			)}

			<div className="grid gap-6 lg:grid-cols-2">
				<Card title="Clasificación actual" description="Ordenada por puntos, en directo.">
					{ranking.length === 0 ? (
						<p className="text-sm text-slate-500">Todavía no hay grupos con puntuación.</p>
					) : (
						<ol className="divide-y divide-slate-100">
							{ranking.slice(0, 8).map((entry) => (
								<li key={entry.groupId} className="flex items-center gap-3 py-2.5">
									<span
										className={[
											'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold',
											entry.position === 1 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-600',
										].join(' ')}
									>
										{entry.position}
									</span>
									<span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
									<span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{entry.name}</span>
									<span className="text-sm font-bold tabular-nums text-slate-900">{formatPoints(entry.totalPoints)}</span>
								</li>
							))}
						</ol>
					)}
				</Card>

				<Card title="Siguientes pasos">
					<ul className="space-y-3 text-sm text-slate-600">
						<li className="flex items-start gap-2">
							<span className="mt-0.5 text-brand-600">1.</span>
							<span>
								Crea los{' '}
								<Link className="font-medium text-brand-600 underline" href="/admin/groups" prefetch={false}>
									grupos
								</Link>{' '}
								y los{' '}
								<Link className="font-medium text-brand-600 underline" href="/admin/students" prefetch={false}>
									alumnos
								</Link>
								.
							</span>
						</li>
						<li className="flex items-start gap-2">
							<span className="mt-0.5 text-brand-600">2.</span>
							<span>
								Asigna los alumnos en el tablero de{' '}
								<Link className="font-medium text-brand-600 underline" href="/admin/assignments" prefetch={false}>
									asignaciones
								</Link>
								.
							</span>
						</li>
						<li className="flex items-start gap-2">
							<span className="mt-0.5 text-brand-600">3.</span>
							<span>
								Crea{' '}
								<Link className="font-medium text-brand-600 underline" href="/admin/exercises" prefetch={false}>
									ejercicios
								</Link>{' '}
								y configura sus códigos secretos.
							</span>
						</li>
						<li className="flex items-start gap-2">
							<span className="mt-0.5 text-brand-600">4.</span>
							<span>
								Entrega a cada alumno su <strong>código de acceso</strong> personal.
							</span>
						</li>
						<li className="flex items-start gap-2">
							<span className="mt-0.5 text-emerald-500">✓</span>
							<span>
								El{' '}
								<Link className="font-medium text-brand-600 underline" href="/ranking" prefetch={false}>
									ranking
								</Link>{' '}
								se publica y actualiza en tiempo real.
							</span>
						</li>
					</ul>
				</Card>
			</div>
		</div>
	);
}
