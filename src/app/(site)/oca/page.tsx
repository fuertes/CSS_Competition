import type { Metadata } from 'next';
import Link from 'next/link';
import Alert from '@/components/ui/Alert';
import Card from '@/components/ui/Card';
import ConfigNotice from '@/components/ui/ConfigNotice';
import EmptyState from '@/components/ui/EmptyState';
import OcaBoard from '@/components/oca/OcaBoard';
import { OCA_GAME_NAME } from '@/lib/oca/module';
import { OCA_BOARD_SIZE } from '@/lib/oca/board';
import { getPool } from '@/lib/db';
import { isDatabaseConfigured } from '@/lib/config';
import { getRequestGroupId } from '@/lib/auth/request-context';
import { listOcaGamesForGroup } from '@/lib/data/oca';
import { formatDateTime } from '@/lib/format';
import type { OcaGameForGroup } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
	title: OCA_GAME_NAME,
	description: 'Partidas de La Oca del Caos en las que participa tu grupo.',
};

/**
 * Área de grupos de La Oca del Caos (solo lectura).
 *
 * La protección por sesión de grupo la aplica el `proxy` (matcher `/oca/:path*`),
 * que reutiliza la sesión de la competición. El identificador del grupo procede
 * de esa sesión verificada en el servidor (nunca de la URL ni del cliente), y la
 * consulta filtra por él: un grupo solo ve las partidas en las que participa.
 *
 * En esta fase ya se muestra el tablero (40 casillas) y la posición persistente
 * del grupo, pero sigue sin haber mecánicas de juego: no se mueve ningún grupo,
 * no hay turnos ni retos. Solo se muestran las partidas en las que participa el
 * grupo y su posición en cada una.
 */
export default async function OcaPage() {
	const configured = isDatabaseConfigured();
	const pool = configured ? getPool() : null;
	const groupId = await getRequestGroupId();

	let games: OcaGameForGroup[] = [];
	let loadError = false;

	if (pool && groupId) {
		try {
			games = await listOcaGamesForGroup(pool, groupId);
		} catch (error) {
			console.error('[oca] No se pudieron cargar las partidas del grupo:', error);
			loadError = true;
		}
	}

	return (
		<section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
			<header className="mb-6">
				<p className="badge border border-brand-200 bg-brand-50 text-brand-700">Nuevo modo de juego</p>
				<h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">{OCA_GAME_NAME}</h1>
				<p className="mt-2 text-sm text-slate-500">
					Estás en el área de tu grupo. Aquí aparecen las partidas en las que participa tu grupo y
					su posición en el tablero.
				</p>
			</header>

			<Alert variant="info" title="Juego en preparación">
				El tablero ya está disponible, pero todavía no se puede jugar: el movimiento, los turnos y
				los retos se implementarán en fases posteriores. De momento solo se consulta la posición de
				tu grupo.
			</Alert>

			{!configured || !pool ? (
				<div className="mt-6">
					<ConfigNotice />
				</div>
			) : !groupId ? (
				<div className="mt-6">
					<Alert variant="error" title="Sesión no válida">
						Vuelve a entrar con tu grupo para ver tus partidas.
					</Alert>
				</div>
			) : loadError ? (
				<div className="mt-6">
					<Alert variant="error" title="No se pudieron cargar las partidas">
						Inténtalo de nuevo dentro de un momento.
					</Alert>
				</div>
			) : games.length === 0 ? (
				<Card
					title="Tus partidas"
					description="Cuando el profesorado te asigne una partida, aparecerá aquí."
					className="mt-6"
				>
					<EmptyState
						icon="flag"
						title="Sin partidas todavía"
						description="Tu grupo aún no participa en ninguna partida de La Oca del Caos."
					/>
				</Card>
			) : (
				<div className="mt-6 space-y-6">
					<h2 className="text-lg font-semibold text-slate-900">Tus partidas</h2>
					{games.map((game) => {
						const own = game.participants.find((participant) => participant.id === groupId);
						return (
							<Card
								key={game.id}
								title={game.name}
								description={`Creada el ${formatDateTime(game.created_at)} · ${game.participants.length} grupo(s) participante(s)`}
							>
								{own ? (
									<p className="mb-4 text-sm text-slate-600">
										Tu posición:{' '}
										<span className="font-semibold text-brand-700">
											casilla {own.position}
										</span>{' '}
										de {OCA_BOARD_SIZE}.
									</p>
								) : (
									<div className="mb-4">
										<Alert variant="error" title="No figuras como participante">
											Tu grupo no aparece en esta partida. Avisa al profesorado.
										</Alert>
									</div>
								)}
								<OcaBoard
									participants={game.participants}
									highlightGroupId={groupId ?? undefined}
								/>
							</Card>
						);
					})}
				</div>
			)}

			<div className="mt-6">
				<Link href="/competicion" prefetch={false} className="btn-secondary">
					Volver a la competición CSS
				</Link>
			</div>
		</section>
	);
}
