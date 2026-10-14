import type { Metadata } from 'next';
import GroupsManager from '@/components/admin/GroupsManager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Grupos' };

export default function AdminGroupsPage() {
	return <GroupsManager />;
}
