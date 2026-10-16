import type { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { groupLoginSchema } from '@/lib/validation';
import { isDatabaseConfigured } from '@/lib/config';
import { getPool } from '@/lib/db';
import { groupLogin } from '@/lib/data/competition';
import { resolveCookieSecure } from '@/lib/auth/cookie-options';
import {
	createGroupSessionToken,
	hashGroupSessionToken,
	setGroupSessionCookie,
} from '@/lib/auth/group-session';
import { relativeRedirect } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Acceso de grupo mediante código. El código se normaliza (mayúsculas) y se
 * verifica en la base de datos; los errores son genéricos y no revelan si el
 * grupo existe. Al autenticarse se emite una cookie de sesión firmada por el
 * servidor (solo se guarda su hash).
 *
 * Todas las respuestas de navegación usan rutas relativas, de modo que el grupo
 * permanece en el mismo host/IP con el que accedió.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
	if (!isDatabaseConfigured()) {
		return relativeRedirect('/competicion/entrar?reason=config');
	}

	const form = await request.formData();
	const parsed = groupLoginSchema.safeParse({ code: String(form.get('code') ?? '') });
	if (!parsed.success) {
		return relativeRedirect('/competicion/entrar?error=1');
	}

	const pool = getPool();
	if (!pool) {
		return relativeRedirect('/competicion/entrar?reason=config');
	}

	const code = parsed.data.code.trim().toUpperCase();
	const token = createGroupSessionToken();

	try {
		const result = await groupLogin(pool, code, hashGroupSessionToken(token));
		if (result.status !== 'ok') {
			const reason = result.status === 'rate_limited' ? 'rate' : '1';
			return relativeRedirect(`/competicion/entrar?error=${reason}`);
		}
	} catch (error) {
		console.error('[api/competicion/entrar] Error al iniciar sesión de grupo:', error);
		return relativeRedirect('/competicion/entrar?error=1');
	}

	const response = relativeRedirect('/competicion');
	setGroupSessionCookie(response, token, resolveCookieSecure(request));
	return response;
}
