import type { Metadata } from 'next';
import DataMaintenancePanel from '@/components/admin/DataMaintenancePanel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Mantenimiento de datos' };

export default function AdminMaintenancePage() {
	return <DataMaintenancePanel />;
}
