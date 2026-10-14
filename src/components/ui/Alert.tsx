import type { ReactNode } from 'react';

type Variant = 'info' | 'success' | 'warning' | 'error';

interface Props {
	variant?: Variant;
	title?: string;
	className?: string;
	children?: ReactNode;
}

const STYLES: Record<Variant, string> = {
	info: 'border-sky-200 bg-sky-50 text-sky-800',
	success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
	warning: 'border-amber-200 bg-amber-50 text-amber-800',
	error: 'border-rose-200 bg-rose-50 text-rose-800',
};

const ICONS: Record<Variant, string> = {
	info: 'ℹ️',
	success: '✅',
	warning: '⚠️',
	error: '⛔',
};

export default function Alert({ variant = 'info', title, className, children }: Props) {
	return (
		<div
			role="alert"
			className={['flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', STYLES[variant], className]
				.filter(Boolean)
				.join(' ')}
		>
			<span aria-hidden="true">{ICONS[variant]}</span>
			<div className="min-w-0">
				{title && <p className="font-semibold">{title}</p>}
				<div className={title ? 'mt-0.5' : undefined}>{children}</div>
			</div>
		</div>
	);
}
