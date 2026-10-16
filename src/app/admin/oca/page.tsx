import type { Metadata } from 'next';
import OcaGamesManager from '@/components/admin/OcaGamesManager';
import { OCA_GAME_NAME } from '@/lib/oca/module';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: OCA_GAME_NAME,
};

/**
 * Panel docente de La Oca del Caos.
 *
 * La protección por sesión de administrador la aplica el `proxy` (matcher
 * `/admin/:path*`) y se vuelve a comprobar en la API. En esta fase solo se
 * pueden crear partidas en estado inicial y elegir sus grupos: no hay inicio,
 * fin, borrado ni reinicio, y no se toca la configuración de CSS Competition.
 */
export default function AdminOcaPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-xl font-bold text-slate-900">{OCA_GAME_NAME}</h1>
				<p className="text-sm text-slate-500">
					Crea partidas y asigna los grupos participantes. El juego (tablero, turnos y retos) se
					implementará en fases posteriores.
				</p>
			</div>

			<OcaGamesManager />
		</div>
	);
}
