import type { Metadata } from 'next';
import ScoresPanel from '@/components/admin/ScoresPanel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Puntuaciones' };

export default function AdminScoresPage() {
	return <ScoresPanel />;
}
