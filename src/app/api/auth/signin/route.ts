import type { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { credentialsSchema } from '@/lib/validation';
import { isDatabaseConfigured } from '@/lib/config';
import { getPool } from '@/lib/db';
import { resolveCookieSecure } from '@/lib/auth/cookie-options';
import { createSession, createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { relativeRedirect } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Inicia sesión de administrador con correo y contraseña (sesión en BD).
 *
 * Todas las respuestas de navegación usan rutas relativas (`relativeRedirect`),
 * de modo que el usuario permanece en el mismo host/IP con el que accedió.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
	if (!isDatabaseConfigured()) {
		return relativeRedirect('/login?reason=config');
	}

	const form = await request.formData();
	const parsed = credentialsSchema.safeParse({
		email: String(form.get('email') ?? ''),
		password: String(form.get('password') ?? ''),
	});
	if (!parsed.success) {
		return relativeRedirect('/login?error=datos');
	}

	const pool = getPool();
	if (!pool) {
		return relativeRedirect('/login?reason=config');
	}

	// Mensaje único: no se revela si el correo existe o no.
	const email = parsed.data.email.trim().toLowerCase();

	let user: { id: string; password_hash: string } | null = null;
	try {
		const { rows } = await pool.query<{ id: string; password_hash: string }>(
			`select id, password_hash from public.admin_users
			 where email = $1 and role = 'admin'
			 limit 1`,
			[email],
		);
		user = rows[0] ?? null;
	} catch (error) {
		console.error('[auth/signin] Error al consultar el administrador:', error);
		return relativeRedirect('/login?error=credenciales');
	}

	if (!user) {
		return relativeRedirect('/login?error=credenciales');
	}

	try {
		const { rows } = await pool.query<{ match: boolean }>(
			`select (password_hash = crypt($1, password_hash)) as match
			 from public.admin_users where id = $2`,
			[parsed.data.password, user.id],
		);
		if (!rows[0]?.match) {
			return relativeRedirect('/login?error=credenciales');
		}
	} catch (error) {
		console.error('[auth/signin] Error al verificar la contraseña:', error);
		return relativeRedirect('/login?error=credenciales');
	}

	const token = createSessionToken();
	try {
		await createSession(user.id, token);
	} catch (error) {
		console.error('[auth/signin] No se pudo registrar la sesión:', error);
		return relativeRedirect('/login?error=credenciales');
	}

	const response = relativeRedirect('/admin');
	setSessionCookie(response, token, resolveCookieSecure(request));
	return response;
}
