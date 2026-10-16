'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECTIONS = [
	{ href: '/admin', label: 'Resumen', end: true },
	{ href: '/admin/students', label: 'Alumnos' },
	{ href: '/admin/groups', label: 'Grupos' },
	{ href: '/admin/assignments', label: 'Asignaciones' },
	{ href: '/admin/exercises', label: 'Ejercicios' },
	{ href: '/admin/css', label: 'Competición CSS' },
	{ href: '/admin/oca', label: 'La Oca' },
	{ href: '/admin/scores', label: 'Puntuaciones' },
	{ href: '/admin/settings', label: 'Configuración' },
	{ href: '/admin/maintenance', label: 'Mantenimiento' },
];

function isActive(pathname: string, href: string, end = false): boolean {
	if (end) return pathname === href || pathname === `${href}/`;
	return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav() {
	const pathname = usePathname();

	return (
		<nav className="shrink-0 overflow-x-auto lg:w-56 lg:overflow-visible" aria-label="Secciones del panel">
			<ul className="flex gap-1 lg:flex-col">
				{SECTIONS.map((section) => (
					<li key={section.href} className="shrink-0">
						<Link
							href={section.href}
							prefetch={false}
							aria-current={isActive(pathname, section.href, section.end) ? 'page' : undefined}
							className={[
								'block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition',
								isActive(pathname, section.href, section.end)
									? 'bg-brand-600 text-white'
									: 'text-slate-600 hover:bg-white hover:text-slate-900',
							].join(' ')}
						>
							{section.label}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
