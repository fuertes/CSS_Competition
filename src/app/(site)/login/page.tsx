import type { Metadata } from 'next';
import ConfigNotice from '@/components/ui/ConfigNotice';
import { isDatabaseConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: { absolute: 'Acceso · Panel docente' },
	description: 'Inicia sesión en el panel de administración de la competición.',
	robots: { index: false, follow: false },
};

const ERRORS: Record<string, string> = {
	credenciales: 'Correo o contraseña incorrectos.',
	'no-autorizado': 'Este usuario no tiene permiso de administración.',
	datos: 'Revisa los datos introducidos.',
	config: 'La aplicación aún no está conectada a PostgreSQL.',
};

interface Props {
	searchParams: Promise<{ error?: string; reason?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
	const configured = isDatabaseConfigured();
	const params = await searchParams;
	const errorParam = params.error;
	const reasonParam = params.reason;

	const errorMessage = errorParam && ERRORS[errorParam] ? ERRORS[errorParam] : null;

	return (
		<section className="mx-auto max-w-md px-4 py-14 sm:px-6">
			{!configured || reasonParam === 'config' ? (
				<ConfigNotice />
			) : (
				<div className="card animate-slide-up p-6">
					<div className="text-center">
						<span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white">
							<svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" strokeLinecap="round" strokeLinejoin="round" />
								<path
									d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</span>
						<h1 className="mt-4 text-xl font-bold text-slate-900">Panel de administración</h1>
						<p className="mt-1 text-sm text-slate-500">Inicia sesión con tu cuenta de docente.</p>
					</div>

					{errorMessage && (
						<p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
							{errorMessage}
						</p>
					)}

					<form method="post" action="/api/auth/signin" className="mt-6 space-y-4">
						<div>
							<label className="label" htmlFor="email">
								Correo
							</label>
							<input
								id="email"
								name="email"
								type="email"
								className="input"
								required
								autoComplete="email"
								placeholder="docente@centro.edu"
							/>
						</div>
						<div>
							<label className="label" htmlFor="password">
								Contraseña
							</label>
							<input
								id="password"
								name="password"
								type="password"
								className="input"
								required
								autoComplete="current-password"
								placeholder="••••••••"
							/>
						</div>
						<button type="submit" className="btn-primary w-full">
							Entrar
						</button>
					</form>

					<p className="mt-5 text-center text-xs text-slate-400">
						¿Primera vez? Ejecuta <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">npm run db:seed-admin</code>{' '}
						con <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">ADMIN_EMAIL</code> y{' '}
						<code className="rounded bg-slate-100 px-1 py-0.5 font-mono">ADMIN_PASSWORD</code> en{' '}
						<code className="rounded bg-slate-100 px-1 py-0.5 font-mono">.env</code>.
					</p>
				</div>
			)}
		</section>
	);
}
