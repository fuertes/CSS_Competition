'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** Carga datos asíncronos con estados de carga/error. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): {
	data: T | null;
	error: string | null;
	loading: boolean;
	reload: () => void;
} {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [tick, setTick] = useState(0);

	useEffect(() => {
		let cancelled = false;
		// Reinicia los estados de carga/error en cada (re)carga (fetch-on-mount deliberado).
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setLoading(true);
		setError(null);
		loader()
			.then((result) => {
				if (!cancelled) setData(result);
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar los datos.');
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [...deps, tick]);

	return { data, error, loading, reload: () => setTick((value) => value + 1) };
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
	return (
		<div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-slate-500" role="status">
			<span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
			{label}
		</div>
	);
}

export function ErrorMessage({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
			{children}
		</div>
	);
}

export function SuccessMessage({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
			{children}
		</div>
	);
}

export function InfoMessage({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
			{children}
		</div>
	);
}

interface ConfirmButtonProps {
	label: string;
	description: string;
	confirmLabel?: string;
	disabled?: boolean;
	onConfirm: () => Promise<void>;
	variant?: 'danger' | 'secondary';
}

/** Botón con confirmación en dos pasos, accesible por teclado. */
export function ConfirmButton({
	label,
	description,
	confirmLabel = 'Sí, continuar',
	disabled,
	onConfirm,
	variant = 'danger',
}: ConfirmButtonProps) {
	const [armed, setArmed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [open, setOpen] = useState(false);

	const base =
		variant === 'danger'
			? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
			: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100';

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		if (open) window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open]);

	return (
		<>
			<button
				type="button"
				disabled={disabled}
				className={['btn border', base].join(' ')}
				onClick={() => setOpen(true)}
			>
				{label}
			</button>

			{open && (
				<div
					className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
					role="dialog"
					aria-modal="true"
					aria-label={label}
					onClick={(event) => {
						if (event.currentTarget === event.target) setOpen(false);
					}}
				>
					<div className="card w-full max-w-md animate-pop p-6">
						<h3 className="text-base font-semibold text-slate-900">{label}</h3>
						<p className="mt-1 text-sm text-slate-600">{description}</p>
						{armed ? (
							<p className="mt-2 text-sm font-semibold text-rose-600">
								Esta acción no se puede deshacer. ¿Continuar?
							</p>
						) : null}
						<div className="mt-5 flex flex-wrap justify-end gap-2">
							<button
								type="button"
								className="btn-secondary"
								onClick={() => {
									setOpen(false);
									setArmed(false);
								}}
							>
								Cancelar
							</button>
							{!armed ? (
								<button
									type="button"
									className={variant === 'danger' ? 'btn-danger' : 'btn-primary'}
									onClick={() => setArmed(true)}
								>
									Continuar
								</button>
							) : (
								<button
									type="button"
									className={variant === 'danger' ? 'btn-danger' : 'btn-primary'}
									disabled={busy}
									onClick={async () => {
										setBusy(true);
										try {
											await onConfirm();
											setOpen(false);
											setArmed(false);
										} finally {
											setBusy(false);
										}
									}}
								>
									{busy ? 'Procesando…' : confirmLabel}
								</button>
							)}
						</div>
					</div>
				</div>
			)}
		</>
	);
}