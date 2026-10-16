import type { Metadata } from 'next';
import Link from 'next/link';
import Alert from '@/components/ui/Alert';
import Card from '@/components/ui/Card';
import ConfigNotice from '@/components/ui/ConfigNotice';
import EmptyState from '@/components/ui/EmptyState';
import { OCA_GAME_NAME } from '@/lib/oca/module';
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
 * En esta fase no hay ninguna mecánica de juego: solo se muestran las partidas
 * creadas por el profesorado en las que participa el grupo.
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
					Estás en el área de tu grupo. Aquí aparecen las partidas en las que participa tu grupo.
				</p>
			</header>

			<Alert variant="info" title="Juego en preparación">
				Todavía no se puede jugar. El tablero, los turnos y los retos se implementarán en fases
				posteriores; de momento solo se consultan las partidas creadas por el profesorado.
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
			) : (
				<Card
					title="Tus partidas"
					description={
						games.length === 0
							? 'Cuando el profesorado te asigne una partida, aparecerá aquí.'
							: 'Partidas en estado inicial en las que participa tu grupo.'
					}
					className="mt-6"
				>
					{games.length === 0 ? (
						<EmptyState
							icon="flag"
							title="Sin partidas todavía"
							description="Tu grupo aún no participa en ninguna partida de La Oca del Caos."
						/>
					) : (
						<ul className="space-y-3">
							{games.map((game) => (
								<li key={game.id} className="rounded-xl border border-slate-200 p-4">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<p className="text-sm font-semibold text-slate-900">{game.name}</p>
										<span className="badge border border-slate-200 bg-slate-50 text-slate-600">
											Creada
										</span>
									</div>
									<p className="mt-1 text-xs text-slate-400">
										Creada el {formatDateTime(game.created_at)}
									</p>
									<div className="mt-3 flex flex-wrap gap-2">
										{game.participants.map((participant) => (
											<span
												key={participant.id}
												className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700"
											>
												<span
													className="h-2.5 w-2.5 rounded-full"
													style={{ backgroundColor: participant.color }}
													aria-hidden="true"
												/>
												{participant.name}
											</span>
										))}
									</div>
								</li>
							))}
						</ul>
					)}
				</Card>
			)}

			<div className="mt-6">
				<Link href="/competicion" prefetch={false} className="btn-secondary">
					Volver a la competición CSS
				</Link>
			</div>
		</section>
	);
}
