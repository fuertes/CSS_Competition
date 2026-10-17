import {
	OCA_BOARD_SQUARES,
	OCA_BOARD_SIZE,
	OCA_BOARD_ZONES,
	OCA_ZONE_DISTRIBUTION_APPROVED,
	OCA_ZONE_DISTRIBUTION_NOTE,
	isValidOcaBoardNumber,
} from '@/lib/oca/board';

/**
 * Participante representado en el tablero. Es la información mínima que
 * necesitan las dos vistas (grupo y docente); no incluye datos privados.
 */
export interface OcaBoardParticipant {
	id: string;
	name: string;
	/** Color de apoyo del grupo. Nunca es el único identificador. */
	color: string;
	/** Casilla del tablero (1..40). */
	position: number;
}

interface Props {
	participants: readonly OcaBoardParticipant[];
	/** Grupo a destacar (vista del grupo: el suyo). */
	highlightGroupId?: string;
	className?: string;
}

/**
 * Tablero de 40 casillas de La Oca del Caos (presentacional, solo lectura).
 *
 * * Numeración estable del 1 al 40, tomada de la definición centralizada.
 * * Muestra las posiciones de los participantes SIN depender solo del color:
 *   cada casilla ocupada muestra el nombre del grupo y hay una leyenda.
 * * Accesible: es una lista ordenada con `aria-label` por casilla, de modo que
 *   un lector de pantalla puede recorrer las 40 posiciones y sus ocupantes.
 * * No es interactivo: no permite mover, cambiar de posición ni finalizar
 *   turnos (fuera del alcance de la Fase 3).
 */
export default function OcaBoard({ participants, highlightGroupId, className }: Props) {
	const participantsBySquare = new Map<number, OcaBoardParticipant[]>();
	const placed: OcaBoardParticipant[] = [];
	for (const participant of participants) {
		if (!isValidOcaBoardNumber(participant.position)) continue;
		placed.push(participant);
		const list = participantsBySquare.get(participant.position);
		if (list) list.push(participant);
		else participantsBySquare.set(participant.position, [participant]);
	}

	return (
		<div className={className}>
			{!OCA_ZONE_DISTRIBUTION_APPROVED && (
				<p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
					{OCA_ZONE_DISTRIBUTION_NOTE}
				</p>
			)}

			<ol
				className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10"
				aria-label={`Tablero de ${OCA_BOARD_SIZE} casillas`}
			>
				{OCA_BOARD_SQUARES.map((square) => {
					const occupants = participantsBySquare.get(square.number) ?? [];
					const occupantLabel =
						occupants.length > 0
							? `: ${occupants.map((occupant) => occupant.name).join(', ')}`
							: ' (vacía)';
					return (
						<li
							key={square.id}
							aria-label={`Casilla ${square.number}${occupantLabel}`}
							className="flex min-h-14 flex-col rounded-lg border border-slate-200 bg-white p-1.5"
						>
							<span className="text-[10px] font-semibold tabular-nums text-slate-400">
								{square.number}
							</span>
							{occupants.length > 0 && (
								<div className="mt-auto flex flex-wrap gap-1">
									{occupants.map((occupant) => {
										const isHighlighted = occupant.id === highlightGroupId;
										return (
											<span
												key={occupant.id}
												className={[
													'inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
													isHighlighted
														? 'bg-brand-100 text-brand-800'
														: 'bg-slate-100 text-slate-700',
												].join(' ')}
											>
												<span
													aria-hidden
													className="h-2 w-2 shrink-0 rounded-full"
													style={{ backgroundColor: occupant.color }}
												/>
												<span className="truncate">{occupant.name}</span>
											</span>
										);
									})}
								</div>
							)}
						</li>
					);
				})}
			</ol>

			{placed.length > 0 && (
				<ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
					{placed.map((participant) => (
						<li key={participant.id} className="inline-flex items-center gap-1.5">
							<span
								aria-hidden
								className="h-2.5 w-2.5 rounded-full"
								style={{ backgroundColor: participant.color }}
							/>
							<span className="font-medium text-slate-700">{participant.name}</span>
							<span>· casilla {participant.position}</span>
							{participant.id === highlightGroupId && (
								<span className="badge bg-brand-100 text-brand-700">Tu grupo</span>
							)}
						</li>
					))}
				</ul>
			)}

			<details className="mt-4 text-xs text-slate-500">
				<summary className="cursor-pointer font-medium text-slate-600">
					Zonas temáticas previstas (asignación pendiente)
				</summary>
				<ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
					{OCA_BOARD_ZONES.map((zone) => (
						<li key={zone.id} className="inline-flex items-center gap-1.5">
							<span
								aria-hidden
								className="h-2.5 w-2.5 rounded-full"
								style={{ backgroundColor: zone.color }}
							/>
							{zone.name}
						</li>
					))}
				</ul>
			</details>
		</div>
	);
}
