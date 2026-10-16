import type { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveCookieSecure } from '@/lib/auth/cookie-options';
import { SESSION_COOKIE, clearSessionCookie, deleteSession } from '@/lib/auth/session';
import { relativeRedirect } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Cierra la sesión de administrador (borra la fila de `admin_sessions`). */
export async function POST(request: NextRequest): Promise<NextResponse> {
	const token = request.cookies.get(SESSION_COOKIE)?.value;
	if (token) {
		await deleteSession(token).catch((error: unknown) => {
			console.error('[auth/signout] No se pudo revocar la sesión:', error);
		});
	}

	const response = relativeRedirect('/');
	clearSessionCookie(response, resolveCookieSecure(request));
	return response;
}
