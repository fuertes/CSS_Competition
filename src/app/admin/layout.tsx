import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import AdminNav from '@/components/admin/AdminNav';
import { getCompetitionName } from '@/lib/config';

/**
 * Layout del panel docente. Redefine el título por defecto (plantilla) bajo
 * `/admin` y marca todas las páginas del panel como no indexables.
 */
export async function generateMetadata(): Promise<Metadata> {
	const competitionName = getCompetitionName();

	return {
		title: {
			default: 'Panel de administración',
			template: `%s · ${competitionName}`,
		},
		robots: { index: false, follow: false },
	};
}

export default function AdminLayout({ children }: { children: ReactNode }) {
	const competitionName = getCompetitionName();

	return (
		<div className="min-h-dvh bg-slate-100">
			<header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
				<div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
					<Link href="/admin" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
						<span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-500 text-white">
							<svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M12 3v3m0 4v3m0 4v3M5 6l14 8M5 14l14-8" strokeLinecap="round" />
							</svg>
						</span>
						Panel · {competitionName}
					</Link>
					<div className="flex items-center gap-3">
						<Link href="/" prefetch={false} className="text-sm text-slate-500 hover:text-slate-800">
							Ver sitio
						</Link>
						<form method="post" action="/api/auth/signout">
							<button type="submit" className="btn-secondary">
								Cerrar sesión
							</button>
						</form>
					</div>
				</div>
			</header>

			<div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
				<AdminNav />
				<main className="min-w-0 flex-1 py-1">{children}</main>
			</div>
		</div>
	);
}
