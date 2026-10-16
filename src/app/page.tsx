import type { Metadata } from 'next';
import EnterpriseLanding from '@/components/marketing/EnterpriseLanding';
import { getCompetitionName, isDatabaseConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
	const competitionName = getCompetitionName();

	return {
		title: { absolute: competitionName },
		description:
			'Plataforma educativa de competición por equipos: códigos secretos, corrección de CSS en equipo y ranking en tiempo real.',
	};
}

/**
 * Portada del sitio.
 *
 * Vive fuera del grupo `(site)` a propósito: es una landing a pantalla completa
 * con su propia cabecera y pie, independiente de la cabecera y el pie
 * compartidos del resto de páginas. El resto de rutas sigue usando `(site)`.
 */
export default function HomePage() {
	return (
		<EnterpriseLanding
			competitionName={getCompetitionName()}
			configured={isDatabaseConfigured()}
		/>
	);
}
