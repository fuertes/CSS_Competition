import type { ReactNode } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getCompetitionName } from '@/lib/config';

/**
 * Layout del sitio público: cabecera, contenido y pie. La cabecera y el pie
 * reciben el nombre de la competición como prop (leído en el servidor) para no
 * exponer la configuración del servidor al navegador.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
	const competitionName = getCompetitionName();

	return (
		<div className="flex min-h-dvh flex-col bg-slate-50">
			<a
				href="#contenido"
				className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
			>
				Saltar al contenido
			</a>
			<Header competitionName={competitionName} />
			<main id="contenido" className="flex-1">
				{children}
			</main>
			<Footer competitionName={competitionName} />
		</div>
	);
}
