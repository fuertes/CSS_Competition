import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { credentialsSchema } from '@/lib/validation';
import { isDatabaseConfigured } from '@/lib/config';
import { getPool } from '@/lib/db';
import { createSession, createSessionToken, setSessionCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Inicia sesión de administrador con correo y contraseña (sesión en BD). */
export async function POST(request: NextRequest): Promise<NextResponse> {
	if (!isDatabaseConfigured()) {
		return NextResponse.redirect(new URL('/login?reason=config', request.url), 303);
	}

	const form = await request.formData();
	const parsed = credentialsSchema.safeParse({
		email: String(form.get('email') ?? ''),
		password: String(form.get('password') ?? ''),
	});
	if (!parsed.success) {
		return NextResponse.redirect(new URL('/login?error=datos', request.url), 303);
	}

	const pool = getPool();
	if (!pool) {
		return NextResponse.redirect(new URL('/login?reason=config', request.url), 303);
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
		return NextResponse.redirect(new URL('/login?error=credenciales', request.url), 303);
	}

	if (!user) {
		return NextResponse.redirect(new URL('/login?error=credenciales', request.url), 303);
	}

	try {
		const { rows } = await pool.query<{ match: boolean }>(
			`select (password_hash = crypt($1, password_hash)) as match
			 from public.admin_users where id = $2`,
			[parsed.data.password, user.id],
		);
		if (!rows[0]?.match) {
			return NextResponse.redirect(new URL('/login?error=credenciales', request.url), 303);
		}
	} catch (error) {
		console.error('[auth/signin] Error al verificar la contraseña:', error);
		return NextResponse.redirect(new URL('/login?error=credenciales', request.url), 303);
	}

	const token = createSessionToken();
	try {
		await createSession(user.id, token);
	} catch (error) {
		console.error('[auth/signin] No se pudo registrar la sesión:', error);
		return NextResponse.redirect(new URL('/login?error=credenciales', request.url), 303);
	}

	const response = NextResponse.redirect(new URL('/admin', request.url), 303);
	setSessionCookie(response, token);
	return response;
}
