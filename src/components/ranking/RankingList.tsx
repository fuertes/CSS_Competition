'use client';

import { useLayoutEffect, useRef } from 'react';
import type { RankingEntry } from '@/types';
import { formatPoints } from '@/lib/format';

interface Props {
	entries: RankingEntry[];
	flashing: Set<string>;
}

const prefersReducedMotion = () =>
	typeof window !== 'undefined' &&
	window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Lista del ranking. Aplica una animación FLIP cuando un equipo cambia de
 * posición y un destello cuando gana puntos.
 */
export default function RankingList({ entries, flashing }: Props) {
	const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
	const previousTops = useRef<Map<string, number>>(new Map());

	useLayoutEffect(() => {
		if (prefersReducedMotion()) return;
		rowRefs.current.forEach((element, groupId) => {
			const nextTop = element.getBoundingClientRect().top;
			const previousTop = previousTops.current.get(groupId);
			if (previousTop !== undefined && Math.abs(previousTop - nextTop) > 1) {
				const delta = previousTop - nextTop;
				element.animate(
					[{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
					{ duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
				);
			}
			previousTops.current.set(groupId, nextTop);
		});
	});

	if (entries.length === 0) {
		return (
			<p className="px-5 py-10 text-center text-sm text-slate-500">
				Todavía no hay grupos en la competición.
			</p>
		);
	}

	return (
		<ol className="divide-y divide-slate-100" aria-label="Clasificación de grupos">
			{entries.map((entry) => {
				const isFlashing = flashing.has(entry.groupId);
				return (
					<li
						key={entry.groupId}
						ref={(element) => {
							if (element) rowRefs.current.set(entry.groupId, element);
							else rowRefs.current.delete(entry.groupId);
						}}
						className={[
							'flex items-center gap-3 px-4 py-3 transition-colors sm:px-5',
							isFlashing ? 'animate-score-flash' : '',
						].join(' ')}
					>
						<span
							className={[
								'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold tabular-nums',
								entry.position === 1
									? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
									: 'bg-slate-100 text-slate-600',
							].join(' ')}
							aria-label={`Posición ${entry.position}`}
						>
							{entry.position}
						</span>

						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span
									className="h-2.5 w-2.5 shrink-0 rounded-full"
									style={{ backgroundColor: entry.color }}
									aria-hidden="true"
								/>
								<span className="truncate text-sm font-semibold text-slate-900">{entry.name}</span>
								{!entry.active && (
									<span className="badge bg-slate-100 text-slate-500">Inactivo</span>
								)}
							</div>
							<p className="mt-0.5 text-xs text-slate-500">
								{entry.solvedCount} {entry.solvedCount === 1 ? 'ejercicio resuelto' : 'ejercicios resueltos'}
							</p>
						</div>

						<div className="text-right">
							<p className="text-lg font-bold tabular-nums text-slate-900">{formatPoints(entry.totalPoints)}</p>
							<p className="text-[11px] tracking-wide text-slate-400 uppercase">puntos</p>
						</div>
					</li>
				);
			})}
		</ol>
	);
}
