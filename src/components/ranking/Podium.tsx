'use client';

import type { RankingEntry } from '@/types';

const MEDALS = ['#f0b429', '#a4b0be', '#cd7f32'] as const;
const MEDAL_LABELS = ['1.º', '2.º', '3.º'] as const;

interface Props {
	entries: RankingEntry[];
}

/**
 * Podio con los tres primeros grupos. En pantallas grandes se coloca primero
 * el segundo, después el primero (más alto) y por último el tercero.
 */
export default function Podium({ entries }: Props) {
	const top = entries.slice(0, 3);
	if (top.length === 0) return null;

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
			{top.map((entry, index) => {
				const medal = MEDALS[index] ?? MEDALS[2];
				const isFirst = index === 0;
				return (
					<div
						key={entry.groupId}
						className={[
							'relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-transform',
							isFirst ? 'border-amber-200 sm:order-2 sm:-translate-y-3' : '',
							index === 1 ? 'border-slate-200 sm:order-1' : '',
							index === 2 ? 'border-orange-200 sm:order-3' : '',
						].join(' ')}
					>
						<div
							className="absolute inset-x-0 top-0 h-1.5"
							style={{ backgroundColor: entry.color }}
							aria-hidden="true"
						/>
						<div className="flex items-center justify-between gap-2">
							<span
								className="grid h-8 w-8 place-items-center rounded-full text-sm font-bold text-white"
								style={{ backgroundColor: medal }}
								aria-label={`Posición ${entry.position}`}
							>
								{MEDAL_LABELS[index]}
							</span>
							{isFirst && (
								<svg viewBox="0 0 24 24" className="h-6 w-6 text-amber-400" fill="currentColor" aria-hidden="true">
									<path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4Zm-2 2H2a2 2 0 0 0 2 4m14-4h2a2 2 0 0 1-2 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							)}
						</div>
						<p className="mt-3 truncate text-sm font-semibold text-slate-900">{entry.name}</p>
						<p className="text-2xl font-bold tabular-nums text-slate-900">{entry.totalPoints}</p>
						<p className="text-xs text-slate-500">
							{entry.solvedCount} {entry.solvedCount === 1 ? 'ejercicio' : 'ejercicios'}
						</p>
					</div>
				);
			})}
		</div>
	);
}
