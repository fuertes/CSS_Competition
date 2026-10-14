interface Props {
	competitionName: string;
}

export default function Footer({ competitionName }: Props) {
	const year = new Date().getFullYear();

	return (
		<footer className="border-t border-slate-200 bg-white">
			<div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<p>
					© {year} {competitionName}
				</p>
				<p className="text-xs text-slate-400">Plataforma educativa de competición por equipos · Next.js + PostgreSQL</p>
			</div>
		</footer>
	);
}
