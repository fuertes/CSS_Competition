type Tone = 'brand' | 'emerald' | 'amber' | 'slate' | 'rose';

interface Props {
	label: string;
	value: string | number;
	hint?: string;
	tone?: Tone;
}

const TONES: Record<Tone, string> = {
	brand: 'from-brand-500 to-accent-500 text-white',
	emerald: 'from-emerald-500 to-teal-500 text-white',
	amber: 'from-amber-400 to-orange-500 text-white',
	rose: 'from-rose-500 to-pink-500 text-white',
	slate: 'from-slate-600 to-slate-800 text-white',
};

export default function StatCard({ label, value, hint, tone = 'brand' }: Props) {
	return (
		<div className="card overflow-hidden p-0">
			<div className={['flex items-center justify-between gap-3 bg-gradient-to-br px-5 py-4', TONES[tone]].join(' ')}>
				<p className="text-xs font-semibold tracking-wide uppercase opacity-90">{label}</p>
				<p className="text-2xl font-bold tabular-nums">{value}</p>
			</div>
			{hint && <p className="px-5 py-3 text-xs text-slate-500">{hint}</p>}
		</div>
	);
}
