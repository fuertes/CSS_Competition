import 'server-only';
import type { ConfigState } from '@/types';

const DEFAULT_COMPETITION_NAME = 'Competición por equipos';

/**
 * Comprueba si la aplicación tiene la configuración mínima de PostgreSQL
 * (variable `DATABASE_URL`, solo de servidor). Si no la tiene, las páginas
 * deben mostrar un estado de configuración pendiente en lugar de datos
 * simulados.
 */
export function getDatabaseConfig(): ConfigState & { url?: string } {
	const url = process.env.DATABASE_URL?.trim();

	if (!url) {
		return {
			configured: false,
			reason:
				'Falta la variable DATABASE_URL. Copia .env.example a .env y complétala con la conexión a PostgreSQL.',
		};
	}

	return { configured: true, url };
}

export function isDatabaseConfigured(): boolean {
	return getDatabaseConfig().configured;
}

/**
 * Nombre visible de la competición. Se lee de `NEXT_PUBLIC_COMPETITION_NAME`
 * (valor no sensible que puede exponerse al navegador). Las páginas de servidor
 * lo leen aquí y lo pasan como prop a los componentes de cliente.
 */
export function getCompetitionName(): string {
	return process.env.NEXT_PUBLIC_COMPETITION_NAME?.trim() || DEFAULT_COMPETITION_NAME;
}
