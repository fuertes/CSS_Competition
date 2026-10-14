import type { Metadata } from 'next';
import ConfigNotice from '@/components/ui/ConfigNotice';
import RankingLive from '@/components/ranking/RankingLive';
import { getPool } from '@/lib/db';
import { fetchRankingRows } from '@/lib/data/postgres';
import { toRankingInputs } from '@/lib/data/ranking';
import { rankEntries } from '@/lib/ranking';
import { getCompetitionName, isDatabaseConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: 'Ranking',
	description: 'Clasificación en tiempo real de la competición por equipos.',
};

export default async function RankingPage() {
	const competitionName = getCompetitionName();
	const configured = isDatabaseConfigured();
	const pool = getPool();
	const today = new Intl.DateTimeFormat('es-ES', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	}).format(new Date());

	let initialEntries: ReturnType<typeof rankEntries> = [];
	let fetchError: string | null = null;

	if (configured && pool) {
		try {
			initialEntries = rankEntries(toRankingInputs(await fetchRankingRows(pool)));
		} catch {
			fetchError = 'No se pudo cargar la clasificación. Inténtalo de nuevo en unos instantes.';
		}
	}

	return (
		<section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
			<header className="mb-6 text-center">
				<p className="badge border border-emerald-200 bg-emerald-50 text-emerald-700">Clasificación en directo</p>
				<h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Ranking</h1>
				<p className="mt-2 text-sm text-slate-500">
					{competitionName} · Sesión del {today}
				</p>
			</header>

			{!configured ? (
				<ConfigNotice />
			) : fetchError ? (
				<p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700" role="alert">
					{fetchError}
				</p>
			) : (
				<RankingLive initialEntries={initialEntries} />
			)}

			<p className="mt-8 text-center text-xs text-slate-400">
				Empates: a igual puntuación gana el grupo que alcanzó el marcador antes. Sin datos suficientes, se
				muestra la posición compartida.
			</p>
		</section>
	);
}
