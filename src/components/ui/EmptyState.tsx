type Icon = 'search' | 'trophy' | 'users' | 'flag';

interface Props {
	title: string;
	description?: string;
	icon?: Icon;
}

export default function EmptyState({ title, description, icon = 'search' }: Props) {
	return (
		<div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
			<span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
				<svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
					{icon === 'trophy' && (
						<path
							d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4Zm-2 2H2a2 2 0 0 0 2 4m14-4h2a2 2 0 0 1-2 4"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					)}
					{icon === 'users' && (
						<path
							d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					)}
					{icon === 'flag' && (
						<path
							d="M4 22V4m0 0s2-2 6-2 6 2 10 2v9c-4 0-6-2-10-2s-6 2-6 2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					)}
					{icon === 'search' && (
						<path d="m21 21-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" strokeLinecap="round" strokeLinejoin="round" />
					)}
				</svg>
			</span>
			<h3 className="text-sm font-semibold text-slate-800">{title}</h3>
			{description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
		</div>
	);
}
