/**
 * Decisión de la marca `Secure` de las cookies de sesión.
 *
 * Una cookie `Secure` solo la envía el navegador por HTTPS. Si la aplicación se
 * despliega sobre HTTP (por ejemplo, una IP pública sin TLS durante una
 * demostración), marcar la cookie como `Secure` haría que el navegador la
 * descartara y la sesión se perdiera justo después de iniciarla.
 *
 * Orden de decisión:
 *  1. `COOKIE_SECURE=true|false` fuerza el valor de forma explícita.
 *  2. Sin override, se deduce del esquema real de la petición
 *     (`X-Forwarded-Proto` o, en su defecto, el de `request.url`).
 *  3. Como último recurso, `Secure` solo en producción.
 *
 * Módulo puro (sin dependencias de Next.js ni de Node) y probable con Vitest.
 */
export function resolveCookieSecure(request: Request): boolean {
	const override = process.env.COOKIE_SECURE?.trim().toLowerCase();
	if (override === 'true') return true;
	if (override === 'false') return false;

	const forwarded = request.headers
		.get('x-forwarded-proto')
		?.split(',')[0]
		?.trim()
		.toLowerCase();
	if (forwarded === 'https') return true;
	if (forwarded === 'http') return false;

	try {
		return new URL(request.url).protocol === 'https:';
	} catch {
		return process.env.NODE_ENV === 'production';
	}
}
