import type { Metadata } from 'next';
import SettingsPanel from '@/components/admin/SettingsPanel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Configuración' };

export default function AdminSettingsPage() {
	return <SettingsPanel />;
}
