import type { Metadata } from 'next';
import ConfigNotice from '@/components/ui/ConfigNotice';
import StudentPortal from '@/components/students/StudentPortal';
import { isDatabaseConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: 'Alumnos',
	description: 'Zona de alumnos: introduce tu código personal y resuelve ejercicios.',
};

export default function AlumnosPage() {
	const configured = isDatabaseConfigured();

	return (
		<section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
			<header className="mb-6 text-center">
				<h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Zona de alumnos</h1>
				<p className="mt-2 text-sm text-slate-500">
					Identifícate con tu código personal y comprueba los códigos de los ejercicios.
				</p>
			</header>

			{configured ? <StudentPortal /> : <ConfigNotice />}
		</section>
	);
}
