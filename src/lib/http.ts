import { NextResponse } from 'next/server';

/** Respuesta JSON uniforme para los endpoints. */
export function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});
}

export function errorResponse(message: string, status = 400): Response {
	return jsonResponse({ error: message }, status);
}

/**
 * Redirección con una ruta RELATIVA (`Location: /ruta`).
 *
 * `NextResponse.redirect` exige una URL absoluta (`validateURL`), lo que obliga
 * a reconstruir el host de la petición y puede acabar filtrando un host interno.
 * El flujo de autenticación (inicio y cierre de sesión, acceso de grupo) usa en
 * su lugar un `Location` relativo, que el navegador resuelve contra la URL de la
 * petición (RFC 9110 §10.2.2): el usuario continúa siempre en el mismo host, IP
 * y protocolo con los que entró, sin que el servidor tenga que conocerlos.
 *
 * El estado por defecto es 302 («Found»), que convierte el POST del formulario
 * en un GET hacia el destino y coincide con lo que verifica el smoke test E2E
 * (`scripts/e2e-smoke.mjs`).
 */
export function relativeRedirect(location: string, status = 302): NextResponse {
	return new NextResponse(null, { status, headers: { location } });
}

/** Lee el cuerpo JSON de una petición sin lanzar excepciones. */
export async function readJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}
