import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, clearSessionCookie, deleteSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Cierra la sesión de administrador (borra la fila de `admin_sessions`). */
export async function POST(request: NextRequest): Promise<NextResponse> {
	const token = request.cookies.get(SESSION_COOKIE)?.value;
	if (token) {
		await deleteSession(token).catch((error: unknown) => {
			console.error('[auth/signout] No se pudo revocar la sesión:', error);
		});
	}

	const response = NextResponse.redirect(new URL('/', request.url), 303);
	clearSessionCookie(response);
	return response;
}
