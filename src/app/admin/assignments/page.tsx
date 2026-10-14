import type { Metadata } from 'next';
import AssignmentsBoard from '@/components/admin/AssignmentsBoard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Asignaciones' };

export default function AdminAssignmentsPage() {
	return <AssignmentsBoard />;
}
