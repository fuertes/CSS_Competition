import type { Metadata } from 'next';
import ConfigNotice from '@/components/ui/ConfigNotice';
import CompetitionView from '@/components/competicion/CompetitionView';
import { isDatabaseConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: 'Competición CSS',
	description: 'Corrige selectores CSS en equipo, consigue puntos parciales y sigue la clasificación.',
};

export default function CompeticionPage() {
	const configured = isDatabaseConfigured();

	return (
		<section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
			{configured ? <CompetitionView /> : <ConfigNotice />}
		</section>
	);
}
