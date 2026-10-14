import type { Metadata } from 'next';
import ExercisesManager from '@/components/admin/ExercisesManager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Ejercicios' };

export default function AdminExercisesPage() {
	return <ExercisesManager />;
}
