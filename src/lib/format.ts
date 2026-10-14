/** Formatea una puntuación con separador de miles en español. */
export function formatPoints(points: number): string {
	return new Intl.NumberFormat('es-ES').format(points);
}

/** Fecha corta y hora, en formato español. */
export function formatDateTime(value: string | null | undefined): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '—';
	return new Intl.DateTimeFormat('es-ES', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(date);
}

export function formatDate(value: string | null | undefined): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '—';
	return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(date);
}

/** Texto relativo sencillo, sin dependencias externas. */
export function formatRelative(value: string | null | undefined): string {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	const seconds = Math.round((Date.now() - date.getTime()) / 1000);
	const abs = Math.abs(seconds);
	if (abs < 60) return 'hace unos segundos';
	const minutes = Math.round(abs / 60);
	if (minutes < 60) return `hace ${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `hace ${hours} h`;
	const days = Math.round(hours / 24);
	return `hace ${days} d`;
}

/** Iniciales para avatares. */
export function initials(name: string): string {
	return name
		.trim()
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part.charAt(0).toUpperCase())
		.join('');
}
