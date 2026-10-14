import 'server-only';
import { Pool } from 'pg';

let pool: Pool | null = null;

/**
 * Devuelve el pool de conexiones a PostgreSQL configurado a partir de
 * `DATABASE_URL`.
 *
 * - Solo debe importarse y usarse en código de servidor (Server Components,
 *   Route Handlers, proxy). Nunca lo importen desde un componente de cliente:
 *   expondría la cadena de conexión al navegador.
 * - El pool se crea una única vez y se reutiliza.
 * - Devuelve `null` si la aplicación no está configurada, de modo que las
 *   páginas puedan mostrar un aviso en lugar de fallar.
 */
export function getPool(): Pool | null {
	const connectionString = process.env.DATABASE_URL?.trim();
	if (!connectionString) return null;

	if (!pool) {
		pool = new Pool({
			connectionString,
			max: 10,
			idleTimeoutMillis: 30_000,
			connectionTimeoutMillis: 5_000,
			application_name: 'aula-competicion',
		});

		// Evita que un error en un cliente inactivo tumbe el proceso.
		pool.on('error', (error) => {
			console.error('[db] Error inesperado del pool de PostgreSQL:', error.message);
		});
	}
	return pool;
}
