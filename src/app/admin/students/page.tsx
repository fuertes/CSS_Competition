import type { Metadata } from 'next';
import StudentsManager from '@/components/admin/StudentsManager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Alumnos' };

export default function AdminStudentsPage() {
	return <StudentsManager />;
}
