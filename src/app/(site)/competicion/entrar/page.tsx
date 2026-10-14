import type { Metadata } from 'next';
import ConfigNotice from '@/components/ui/ConfigNotice';
import { isDatabaseConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: 'Acceso de grupo',
	description: 'Introduce el código de tu grupo para participar en la competición CSS.',
};

/**
 * Mensajes genéricos: no revelan si el grupo existe ni distinguen el motivo.
 */
const MESSAGES: Record<string, string> = {
	'1': 'Código incorrecto o no válido.',
	rate: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
};

interface Props {
	searchParams: Promise<{ error?: string; reason?: string }>;
}

export default async function EntrarPage({ searchParams }: Props) {
	const configured = isDatabaseConfigured();
	const params = await searchParams;
	const errorParam = params.error;
	const reasonParam = params.reason;

	const errorMessage = errorParam ? (MESSAGES[errorParam] ?? MESSAGES['1']) : null;

	return (
		<section className="mx-auto max-w-md px-4 py-14 sm:px-6">
			{!configured || reasonParam === 'config' ? (
				<ConfigNotice />
			) : (
				<div className="card animate-slide-up p-6">
					<div className="text-center">
						<span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-white">
							<svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
						</span>
						<h1 className="mt-4 text-xl font-bold text-slate-900">Acceso de grupo</h1>
						<p className="mt-1 text-sm text-slate-500">
							Introduce el código que te ha entregado tu profesor para corregir CSS.
						</p>
					</div>

					{errorMessage && (
						<p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
							{errorMessage}
						</p>
					)}

					<form method="post" action="/api/competicion/entrar" className="mt-6 space-y-4">
						<div>
							<label className="label" htmlFor="code">
								Código del grupo
							</label>
							<input
								id="code"
								name="code"
								className="input font-mono tracking-[0.3em] uppercase"
								required
								maxLength={32}
								autoComplete="off"
								autoCapitalize="characters"
								spellCheck={false}
								placeholder="XXXXXXXX"
							/>
						</div>
						<button type="submit" className="btn-primary w-full">
							Entrar
						</button>
					</form>

					<p className="mt-5 text-center text-xs text-slate-400">
						El mismo código identifica a todo el grupo; se mantiene la sesión durante la competición.
					</p>
				</div>
			)}
		</section>
	);
}
