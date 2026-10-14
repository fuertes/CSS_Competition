import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isDatabaseConfigured } from '@/lib/config';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { GROUP_SESSION_COOKIE, verifyGroupSession } from '@/lib/auth/group-session';

/**
 * Proxy (antiguo middleware) de la aplicación.
 *
 * Sustituye al middleware de Astro: verifica la sesión antes de que la petición
 * llegue a las páginas o a los Route Handlers y garantiza que solo las peticiones
 * autenticadas accedan al panel docente y a la competición de grupos.
 *
 * La identidad verificada se propaga a la aplicación mediante los encabezados
 * internos `x-user-id` / `x-group-id`. El proxy elimina siempre cualquier valor
 * entrante con esos nombres, de modo que un cliente no pueda falsificarlos.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Rutas de página que requieren sesión de administrador. */
function isProtectedPage(pathname: string): boolean {
	return pathname === '/admin' || pathname.startsWith('/admin/');
}

/** Endpoints del panel que requieren sesión de administrador. */
function isAdminApi(pathname: string): boolean {
	return pathname === '/api/admin' || pathname.startsWith('/api/admin/');
}

/** Página pública de acceso de grupo (sin sesión todavía). */
function isCompetitionLoginPage(pathname: string): boolean {
	return pathname === '/competicion/entrar' || pathname.startsWith('/competicion/entrar/');
}

/** Páginas de la competición que requieren sesión de grupo. */
function isCompetitionPage(pathname: string): boolean {
	const isUnder = pathname === '/competicion' || pathname.startsWith('/competicion/');
	return isUnder && !isCompetitionLoginPage(pathname);
}

/** Endpoint público de acceso de grupo. */
function isCompetitionLoginApi(pathname: string): boolean {
	return pathname === '/api/competicion/entrar';
}

/** Endpoints de la competición que requieren sesión de grupo. */
function isCompetitionApi(pathname: string): boolean {
	const isUnder = pathname === '/api/competicion' || pathname.startsWith('/api/competicion/');
	return isUnder && !isCompetitionLoginApi(pathname);
}

function json(message: string, status: number): NextResponse {
	return NextResponse.json({ error: message }, { status });
}

/**
 * En peticiones que cambian estado desde otro origen, el origen debe coincidir
 * con el servidor (defensa contra peticiones cross-site).
 */
function isCrossOrigin(request: NextRequest): boolean {
	if (!MUTATING_METHODS.has(request.method)) return false;
	const origin = request.headers.get('origin');
	const host = request.headers.get('host');
	if (!origin || !host) return false;
	try {
		return new URL(origin).host !== host;
	} catch {
		return true;
	}
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
	const { pathname } = request.nextUrl;
	const adminPage = isProtectedPage(pathname);
	const adminApi = isAdminApi(pathname);
	const groupPage = isCompetitionPage(pathname);
	const groupApi = isCompetitionApi(pathname);

	// Encabezados de identidad saneados: siempre se eliminan los del cliente.
	const requestHeaders = new Headers(request.headers);
	requestHeaders.delete('x-user-id');
	requestHeaders.delete('x-group-id');

	const passThrough = () => NextResponse.next({ request: { headers: requestHeaders } });

	if (!adminPage && !adminApi && !groupPage && !groupApi) {
		return passThrough();
	}

	if (!isDatabaseConfigured()) {
		if (adminApi || groupApi) {
			return json('La aplicación no está configurada con PostgreSQL.', 503);
		}
		if (adminPage) return NextResponse.redirect(new URL('/login?reason=config', request.url));
		return NextResponse.redirect(new URL('/competicion/entrar?reason=config', request.url));
	}

	if ((adminApi || groupApi) && isCrossOrigin(request)) {
		return json('Origen no permitido.', 403);
	}

	if (adminPage || adminApi) {
		const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
		if (!user) {
			if (adminApi) return json('Sesión no válida o caducada.', 401);
			return NextResponse.redirect(new URL('/login', request.url));
		}
		requestHeaders.set('x-user-id', user.id);
		return passThrough();
	}

	// Competición por grupos.
	const group = await verifyGroupSession(request.cookies.get(GROUP_SESSION_COOKIE)?.value);
	if (!group) {
		if (groupApi) return json('Sesión de grupo no válida o caducada.', 401);
		return NextResponse.redirect(new URL('/competicion/entrar', request.url));
	}
	requestHeaders.set('x-group-id', group.id);
	return passThrough();
}

export const config = {
	matcher: [
		'/admin/:path*',
		'/api/admin/:path*',
		'/competicion/:path*',
		'/api/competicion/:path*',
	],
};
