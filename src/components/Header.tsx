'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
	competitionName: string;
}

const LINKS = [
	{ href: '/', label: 'Inicio' },
	{ href: '/ranking', label: 'Ranking' },
	{ href: '/alumnos', label: 'Alumnos' },
	{ href: '/competicion', label: 'Competición' },
	{ href: '/admin', label: 'Panel' },
];

function isActive(pathname: string, href: string): boolean {
	if (href === '/') return pathname === '/';
	return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Header({ competitionName }: Props) {
	const pathname = usePathname();

	return (
		<header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
				<Link href="/" className="flex items-center gap-2.5 font-semibold text-slate-900">
					<span
						className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-white shadow-sm"
						aria-hidden="true"
					>
						<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4Z" strokeLinecap="round" strokeLinejoin="round" />
							<path d="M6 6H4a2 2 0 0 0 2 4M18 6h2a2 2 0 0 1-2 4" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
					</span>
					<span className="hidden text-sm leading-tight sm:block">
						<span className="block text-[11px] font-medium tracking-wide text-brand-600 uppercase">Competición</span>
						<span className="block max-w-[16rem] truncate">{competitionName}</span>
					</span>
				</Link>

				<nav className="hidden items-center gap-1 md:flex" aria-label="Navegación principal">
					{LINKS.map((link) => (
						<Link
							key={link.href}
							href={link.href}
							prefetch={false}
							aria-current={isActive(pathname, link.href) ? 'page' : undefined}
							className={[
								'rounded-lg px-3 py-2 text-sm font-medium transition',
								isActive(pathname, link.href)
									? 'bg-brand-50 text-brand-700'
									: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
							].join(' ')}
						>
							{link.label}
						</Link>
					))}
				</nav>

				<details className="group relative md:hidden">
					<summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 marker:content-none">
						<span className="sr-only">Abrir menú</span>
						<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
						</svg>
						Menú
					</summary>
					<div className="absolute right-0 mt-2 flex w-48 flex-col rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
						{LINKS.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								prefetch={false}
								aria-current={isActive(pathname, link.href) ? 'page' : undefined}
								className={[
									'rounded-lg px-3 py-2 text-sm font-medium transition',
									isActive(pathname, link.href)
										? 'bg-brand-50 text-brand-700'
										: 'text-slate-600 hover:bg-slate-100',
								].join(' ')}
							>
								{link.label}
							</Link>
						))}
					</div>
				</details>
			</div>
		</header>
	);
}
