import type { Metadata } from 'next';
import Link from 'next/link';
import Alert from '@/components/ui/Alert';
import Card from '@/components/ui/Card';
import { OCA_GAME_NAME } from '@/lib/oca/module';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: OCA_GAME_NAME,
	description: 'Nuevo modo de juego por grupos para CSS Competition.',
};

/**
 * Punto de entrada del área de grupos de La Oca del Caos.
 *
 * La protección por sesión de grupo la aplica el `proxy` (matcher `/oca/:path*`),
 * que reutiliza la sesión existente de la competición. En esta fase la página es
 * solo informativa: no consulta ni modifica la base de datos y no implementa
 * ninguna mecánica de juego.
 */
export default function OcaPage() {
	return (
		<section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
			<header className="mb-6">
				<p className="badge border border-brand-200 bg-brand-50 text-brand-700">Nuevo modo de juego</p>
				<h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">{OCA_GAME_NAME}</h1>
				<p className="mt-2 text-sm text-slate-500">
					Estás en el área de tu grupo. La Oca del Caos será un modo de juego independiente de la
					competición CSS, integrado en esta misma plataforma.
				</p>
			</header>

			<Alert variant="info" title="Juego en preparación">
				Todavía no se puede jugar. Este es el punto de entrada del nuevo módulo: aquí aparecerán el
				tablero, los turnos y los retos cuando estén implementados.
			</Alert>

			<Card title="Mientras tanto" className="mt-6">
				<p className="text-sm text-slate-600">
					La competición CSS sigue activa y sin cambios. Puedes volver a ella cuando quieras.
				</p>
				<div className="mt-4 flex flex-wrap gap-3">
					<Link href="/competicion" prefetch={false} className="btn-primary">
						Volver a la competición CSS
					</Link>
				</div>
			</Card>
		</section>
	);
}
