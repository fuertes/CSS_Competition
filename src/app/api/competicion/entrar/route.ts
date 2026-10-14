import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { groupLoginSchema } from '@/lib/validation';
import { isDatabaseConfigured } from '@/lib/config';
import { getPool } from '@/lib/db';
import { groupLogin } from '@/lib/data/competition';
import {
	createGroupSessionToken,
	hashGroupSessionToken,
	setGroupSessionCookie,
} from '@/lib/auth/group-session';

export const dynamic = 'force-dynamic';

/**
 * Acceso de grupo mediante código. El código se normaliza (mayúsculas) y se
 * verifica en la base de datos; los errores son genéricos y no revelan si el
 * grupo existe. Al autenticarse se emite una cookie de sesión firmada por el
 * servidor (solo se guarda su hash).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
	if (!isDatabaseConfigured()) {
		return NextResponse.redirect(new URL('/competicion/entrar?reason=config', request.url), 303);
	}

	const form = await request.formData();
	const parsed = groupLoginSchema.safeParse({ code: String(form.get('code') ?? '') });
	if (!parsed.success) {
		return NextResponse.redirect(new URL('/competicion/entrar?error=1', request.url), 303);
	}

	const pool = getPool();
	if (!pool) {
		return NextResponse.redirect(new URL('/competicion/entrar?reason=config', request.url), 303);
	}

	const code = parsed.data.code.trim().toUpperCase();
	const token = createGroupSessionToken();

	try {
		const result = await groupLogin(pool, code, hashGroupSessionToken(token));
		if (result.status !== 'ok') {
			const reason = result.status === 'rate_limited' ? 'rate' : '1';
			return NextResponse.redirect(new URL(`/competicion/entrar?error=${reason}`, request.url), 303);
		}
	} catch (error) {
		console.error('[api/competicion/entrar] Error al iniciar sesión de grupo:', error);
		return NextResponse.redirect(new URL('/competicion/entrar?error=1', request.url), 303);
	}

	const response = NextResponse.redirect(new URL('/competicion', request.url), 303);
	setGroupSessionCookie(response, token);
	return response;
}
