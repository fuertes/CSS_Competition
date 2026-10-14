import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/app/globals.css';
import { getCompetitionName } from '@/lib/config';

/**
 * Layout raíz: define el documento HTML, los estilos globales y los metadatos
 * por defecto. El nombre visible de la competición se lee en el servidor y se
 * usa como título por defecto y como plantilla para el resto de páginas.
 */
export async function generateMetadata(): Promise<Metadata> {
	const competitionName = getCompetitionName();

	return {
		title: {
			default: competitionName,
			template: `%s · ${competitionName}`,
		},
		description:
			'Plataforma educativa de competición por equipos: resuelve ejercicios con códigos secretos y sigue la clasificación en tiempo real.',
		icons: {
			icon: '/favicon.svg',
		},
	};
}

export const viewport: Viewport = {
	themeColor: '#4f46e5',
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="es">
			<body className="min-h-dvh">{children}</body>
		</html>
	);
}
