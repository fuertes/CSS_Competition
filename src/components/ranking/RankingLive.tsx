'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RankingEntry } from '@/types';
import { fetchRanking } from '@/lib/data/ranking';
import { rankEntries } from '@/lib/ranking';
import Podium from './Podium';
import RankingList from './RankingList';

type ConnectionStatus = 'connecting' | 'live' | 'offline';

interface Toast {
	id: string;
	groupId: string;
	name: string;
	points: number;
	color: string;
}

interface Props {
	initialEntries: RankingEntry[];
}

const STATUS_STYLES: Record<ConnectionStatus, string> = {
	live: 'border-emerald-200 bg-emerald-50 text-emerald-700',
	connecting: 'border-amber-200 bg-amber-50 text-amber-700',
	offline: 'border-slate-200 bg-slate-100 text-slate-600',
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
	live: 'En directo',
	connecting: 'Conectando…',
	offline: 'Sin conexión',
};

/**
 * Frecuencia de sondeo del ranking (se puede aumentar o sustituir por SSE).
 */
const POLL_INTERVAL_MS = 5000;

/**
 * Ranking en tiempo real.
 *
 * Recibe los datos iniciales renderizados en el servidor y, a partir de ahí,
 * sondea periódicamente el endpoint público `/api/ranking` para mantenerse
 * actualizado sin recargar la página.
 *
 * 📡 Evolución prevista: sustituir el temporizador por una suscripción
 * SSE/WebSocket que llame a `applyEntries(rankEntries(inputs))` con cada
 * evento. El resto del componente no necesita cambiar.
 */
export default function RankingLive({ initialEntries }: Props) {
	const [entries, setEntries] = useState<RankingEntry[]>(initialEntries);
	const [status, setStatus] = useState<ConnectionStatus>('connecting');
	const [flashing, setFlashing] = useState<Set<string>>(() => new Set());
	const [toasts, setToasts] = useState<Toast[]>([]);

	const totalsRef = useRef<Map<string, number>>(
		new Map(initialEntries.map((entry) => [entry.groupId, entry.totalPoints])),
	);
	const flashTimer = useRef<number | undefined>(undefined);
	const toastTimers = useRef<number[]>([]);

	const applyEntries = useCallback((next: RankingEntry[]) => {
		const increases: Toast[] = [];
		for (const entry of next) {
			const previous = totalsRef.current.get(entry.groupId);
			if (previous !== undefined && entry.totalPoints > previous) {
				increases.push({
					id: `${entry.groupId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					groupId: entry.groupId,
					name: entry.name,
					points: entry.totalPoints - previous,
					color: entry.color,
				});
			}
			totalsRef.current.set(entry.groupId, entry.totalPoints);
		}

		setEntries(next);

		if (increases.length > 0) {
			setFlashing(new Set(increases.map((item) => item.groupId)));
			window.clearTimeout(flashTimer.current);
			flashTimer.current = window.setTimeout(() => setFlashing(new Set()), 1600);

			setToasts((current) => [...current, ...increases]);
			for (const item of increases) {
				const timer = window.setTimeout(() => {
					setToasts((current) => current.filter((toast) => toast.id !== item.id));
				}, 4500);
				toastTimers.current.push(timer);
			}
		}
	}, []);

	// Sondeo periódico (con costura para migrar a SSE/WebSocket).
	useEffect(() => {
		let cancelled = false;
		let inFlight = false;

		const tick = async () => {
			if (cancelled || inFlight) return;
			// No sondees mientras la pestaña está oculta.
			if (document.visibilityState === 'hidden') return;
			inFlight = true;
			try {
				const inputs = await fetchRanking();
				if (cancelled) return;
				applyEntries(rankEntries(inputs));
				setStatus('live');
			} catch {
				if (!cancelled) setStatus('offline');
			} finally {
				inFlight = false;
			}
		};

		void tick();
		const timer = window.setInterval(() => void tick(), POLL_INTERVAL_MS);

		const onVisible = () => {
			if (document.visibilityState === 'visible') void tick();
		};
		const onOnline = () => void tick();

		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('online', onOnline);

		return () => {
			cancelled = true;
			window.clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('online', onOnline);
		};
	}, [applyEntries]);

	useEffect(
		() => () => {
			window.clearTimeout(flashTimer.current);
			for (const timer of toastTimers.current) window.clearTimeout(timer);
		},
		[],
	);

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<span
					className={[
						'badge gap-2 border px-3 py-1',
						STATUS_STYLES[status],
					].join(' ')}
					role="status"
					aria-live="polite"
				>
					<span
						className={[
							'h-2 w-2 rounded-full',
							status === 'live'
								? 'animate-pulse-ring bg-emerald-500'
								: status === 'connecting'
									? 'bg-amber-500'
									: 'bg-slate-400',
						].join(' ')}
						aria-hidden="true"
					/>
					{STATUS_LABEL[status]}
				</span>
				<p className="text-sm text-slate-500">
					{entries.length} {entries.length === 1 ? 'grupo' : 'grupos'} en competición
				</p>
			</div>

			{entries.length >= 3 && <Podium entries={entries} />}

			<div className="card overflow-hidden" style={{ padding: 0 }}>
				<RankingList entries={entries} flashing={flashing} />
			</div>

			<div
				className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
				aria-live="polite"
			>
				{toasts.map((toast) => (
					<div
						key={toast.id}
						className="animate-slide-up pointer-events-auto flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-lg"
					>
						<span
							className="h-2.5 w-2.5 rounded-full"
							style={{ backgroundColor: toast.color }}
							aria-hidden="true"
						/>
						<span className="text-sm font-semibold text-slate-900">{toast.name}</span>
						<span className="badge bg-emerald-100 text-emerald-700">+{toast.points} puntos</span>
					</div>
				))}
			</div>
		</div>
	);
}