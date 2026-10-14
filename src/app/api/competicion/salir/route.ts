import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
	GROUP_SESSION_COOKIE,
	clearGroupSessionCookie,
	revokeGroupSession,
} from '@/lib/auth/group-session';

export const dynamic = 'force-dynamic';

/** Cierre de sesión de grupo: revoca la sesión en la base de datos y borra la cookie. */
export async function POST(request: NextRequest): Promise<NextResponse> {
	await revokeGroupSession(request.cookies.get(GROUP_SESSION_COOKIE)?.value);

	const response = NextResponse.redirect(new URL('/competicion/entrar', request.url), 303);
	clearGroupSessionCookie(response);
	return response;
}
