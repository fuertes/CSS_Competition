/**
 * Resolución del host público de una petición.
 *
 * El flujo de autenticación ya no construye URLs absolutas: navega con rutas
 * relativas (`relativeRedirect`), de modo que el navegador resuelve el destino
 * contra el host, la IP y el protocolo reales de la petición.
 *
 * Este módulo solo conserva el cálculo del host, que el `proxy` usa para la
 * comprobación de mismo origen (CSRF). Detrás de un proxy inverso, el host
 * público llega en `X-Forwarded-Host` cuando `Host` apunta a un valor interno.
 *
 * Módulo puro (sin dependencias de Next.js ni de Node) y probable con Vitest.
 */

/** Primer valor de una cabecera que puede llegar como lista (`"a, b"`). */
function firstHeaderValue(value: string | null): string | null {
	if (!value) return null;
	const first = value.split(',')[0]?.trim();
	return first ? first : null;
}

/**
 * Host público de la petición. Se prioriza `Host` (que los proxies con
 * `proxy_set_header Host $host` conservan) y, si falta, `X-Forwarded-Host`.
 */
export function getRequestHost(request: Request): string | null {
	return (
		firstHeaderValue(request.headers.get('host')) ??
		firstHeaderValue(request.headers.get('x-forwarded-host'))
	);
}
