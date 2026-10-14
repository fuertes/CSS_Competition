import type { Metadata } from 'next';
import CssImporter from '@/components/admin/CssImporter';
import CssExerciseManager from '@/components/admin/CssExerciseManager';
import CompetitionsManager from '@/components/admin/CompetitionsManager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Competición CSS' };

export default function AdminCssPage() {
	return (
		<>
			<CssImporter />
			<CssExerciseManager />
			<CompetitionsManager />
		</>
	);
}
