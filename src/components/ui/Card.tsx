import type { ReactNode } from 'react';

interface Props {
	title?: string;
	description?: string;
	className?: string;
	padded?: boolean;
	children?: ReactNode;
}

export default function Card({ title, description, className, padded = true, children }: Props) {
	return (
		<section className={['card', className].filter(Boolean).join(' ')}>
			{(title || description) && (
				<header className="border-b border-slate-100 px-5 py-4">
					{title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
					{description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
				</header>
			)}
			<div className={padded ? 'p-5' : undefined}>{children}</div>
		</section>
	);
}
