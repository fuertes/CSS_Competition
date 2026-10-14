import type { Metadata } from 'next';
import Link from 'next/link';
import { getCompetitionName, isDatabaseConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
	const competitionName = getCompetitionName();

	return {
		title: { absolute: competitionName },
		description: 'Plataforma educativa de competición por equipos con ranking en tiempo real.',
	};
}

const FEATURES = [
	{
		href: '/ranking',
		icon: '🏆',
		tone: 'from-amber-400 to-orange-500',
		title: 'Ranking en directo',
		description: 'Clasificación pública que se actualiza al instante cuando un grupo resuelve un ejercicio.',
	},
	{
		href: '/alumnos',
		icon: '🔑',
		tone: 'from-brand-500 to-accent-500',
		title: 'Zona de alumnos',
		description: 'Introduce tu código personal, resuelve ejercicios secretos y suma puntos para tu equipo.',
	},
	{
		href: '/admin',
		icon: '🛠️',
		tone: 'from-slate-600 to-slate-800',
		title: 'Panel docente',
		description: 'Gestiona grupos, alumnos, ejercicios y códigos desde una interfaz protegida.',
	},
];

const STEPS = [
	'El profesor prepara los grupos y asigna a cada alumno.',
	'Cada ejercicio esconde un código que solo conoce el profesor.',
	'Los alumnos introducen el código correcto y su equipo gana 100 puntos.',
	'El ranking se actualiza en tiempo real para todos.',
];

export default function HomePage() {
	const competitionName = getCompetitionName();
	const configured = isDatabaseConfigured();

	return (
		<>
			<section className="relative overflow-hidden border-b border-slate-200">
				<div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-200/50 blur-3xl"></div>
				<div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-accent-500/20 blur-3xl"></div>

				<div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-20">
					<div>
						<p className="badge border border-brand-200 bg-brand-50 text-brand-700">
							<span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
							Competición por equipos
						</p>
						<h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
							Resuelve.
							<br />
							<label className="bg-gradient-to-r from-brand-600 to-accent-500 bg-clip-text text-transparent">
								Suma puntos.
							</label>
							<br />
							{configured ? 'Gana la clasificación.' : 'Prepáralo todo.'}
						</h1>
						<p className="mt-4 max-w-xl text-lg text-slate-600">
							<span className="font-semibold text-slate-800">{competitionName}</span> convierte el aula en un
							reto por equipos: códigos secretos, puntuación automática y una clasificación en vivo.
						</p>
						<div className="mt-7 flex flex-wrap gap-3">
							<Link href="/ranking" prefetch={false} className="btn-primary">
								Ver el ranking
							</Link>
							<Link href="/alumnos" prefetch={false} className="btn-secondary">
								Zona de alumnos
							</Link>
						</div>
						{!configured && (
							<p className="mt-5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
								<span aria-hidden="true">⚠️</span>
								<span>
									La aplicación aún no está conectada a PostgreSQL.{' '}
									<Link className="font-semibold underline" href="/admin" prefetch={false}>
										Ver instrucciones
									</Link>
								</span>
							</p>
						)}
					</div>

					<div className="card relative p-8">
						<p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Cómo funciona</p>
						<ol className="mt-5 space-y-5">
							{STEPS.map((step, index) => (
								<li key={step} className="flex gap-4">
									<span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-bold text-white">
										{index + 1}
									</span>
									<p className="pt-1.5 text-sm leading-relaxed text-slate-600">{step}</p>
								</li>
							))}
						</ol>
					</div>
				</div>
			</section>

			<section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
				<h2 className="text-center text-2xl font-bold text-slate-900">Entra a la competición</h2>
				<p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-500">
					Tres puertas de acceso según tu perfil: el público, los alumnos y el equipo docente.
				</p>
				<div className="mt-8 grid gap-5 md:grid-cols-3">
					{FEATURES.map((feature) => (
						<Link
							key={feature.href}
							href={feature.href}
							prefetch={false}
							className="card group p-6 transition duration-200 hover:-translate-y-1 hover:shadow-md"
						>
							<span
								className={[
									'grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br text-xl',
									feature.tone,
								].join(' ')}
							>
								{feature.icon}
							</span>
							<h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
							<p className="mt-1.5 text-sm leading-relaxed text-slate-500">{feature.description}</p>
							<span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition-all group-hover:gap-2">
								Entrar
								<span aria-hidden="true">→</span>
							</span>
						</Link>
					))}
				</div>
			</section>
		</>
	);
}
