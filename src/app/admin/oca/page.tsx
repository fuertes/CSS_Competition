import type { Metadata } from 'next';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import { OCA_GAME_NAME } from '@/lib/oca/module';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: OCA_GAME_NAME,
};

/**
 * Punto de entrada del panel docente de La Oca del Caos.
 *
 * La protección por sesión de administrador la aplica el `proxy` (matcher
 * `/admin/:path*`). En esta fase es solo informativo: no hay partidas que
 * administrar y no se ofrece ninguna acción (crear, iniciar, borrar o
 * reiniciar), ni se toca la configuración general ni la de CSS Competition.
 */
export default function AdminOcaPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-xl font-bold text-slate-900">{OCA_GAME_NAME}</h1>
				<p className="text-sm text-slate-500">Administración del modo de juego (en preparación).</p>
			</div>

			<Card>
				<EmptyState
					icon="flag"
					title="Juego no configurado"
					description="Todavía no hay partidas que administrar. Este panel se completará en fases posteriores, cuando se definan las reglas del juego."
				/>
			</Card>
		</div>
	);
}
