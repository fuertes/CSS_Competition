import type { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { resolveCookieSecure } from '@/lib/auth/cookie-options';
import {
	GROUP_SESSION_COOKIE,
	clearGroupSessionCookie,
	revokeGroupSession,
} from '@/lib/auth/group-session';
import { relativeRedirect } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Cierre de sesión de grupo: revoca la sesión en la base de datos y borra la cookie. */
export async function POST(request: NextRequest): Promise<NextResponse> {
	await revokeGroupSession(request.cookies.get(GROUP_SESSION_COOKIE)?.value);

	const response = relativeRedirect('/competicion/entrar');
	clearGroupSessionCookie(response, resolveCookieSecure(request));
	return response;
}
