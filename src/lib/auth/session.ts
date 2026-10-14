import { createHash, randomBytes } from 'node:crypto';
import type { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const SESSION_COOKIE = 'aula_session';
/** Duración de la sesión administrativa (7 días). */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionUser {
	id: string;
	email: string;
	displayName: string | null;
}

/**
 * Almacena el hash SHA-256 del token en la base de datos para que un volcado
 * de la tabla `admin_sessions` no permita suplantar sesiones.
 */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Genera un token de sesión aleatorio (suficiente entropía para 32 bytes). */
export function createSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * Valida un token de sesión contra la base de datos. Devuelve el usuario
 * administrador asociado o `null` si no existe, caducó o la BD no está
 * configurada.
 */
export async function verifySessionToken(
	token: string | null | undefined,
): Promise<SessionUser | null> {
	if (!token) return null;
	const pool = getPool();
	if (!pool) return null;

	try {
		const { rows } = await pool.query<{
			id: string;
			email: string;
			display_name: string | null;
		}>(
			`select u.id, u.email, u.display_name
			 from public.admin_sessions s
			 join public.admin_users u on u.id = s.user_id
			 where s.token_hash = $1 and s.expires_at > now()
			 limit 1`,
			[hashSessionToken(token)],
		);
		const row = rows[0];
		if (!row) return null;
		return { id: row.id, email: row.email, displayName: row.display_name };
	} catch (error) {
		console.error('[auth] No se pudo verificar la sesión:', error);
		return null;
	}
}

/** Registra una sesión nueva y limpia las caducadas. */
export async function createSession(userId: string, token: string): Promise<void> {
	const pool = getPool();
	if (!pool) throw new Error('La base de datos no está configurada.');

	await pool.query('delete from public.admin_sessions where expires_at <= now()');
	await pool.query(
		`insert into public.admin_sessions (user_id, token_hash, expires_at)
		 values ($1, $2, now() + make_interval(secs => $3))`,
		[userId, hashSessionToken(token), SESSION_TTL_SECONDS],
	);
}

/** Elimina la sesión asociada a un token (cierre de sesión). */
export async function deleteSession(token: string): Promise<void> {
	const pool = getPool();
	if (!pool) return;
	await pool.query('delete from public.admin_sessions where token_hash = $1', [
		hashSessionToken(token),
	]);
}

/**
 * Escribe la cookie de sesión en la respuesta. `Secure` se activa en
 * producción (HTTPS) y se omite en desarrollo local sobre HTTP.
 */
export function setSessionCookie(response: NextResponse, token: string): void {
	response.cookies.set({
		name: SESSION_COOKIE,
		value: token,
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: SESSION_TTL_SECONDS,
	});
}

export function clearSessionCookie(response: NextResponse): void {
	response.cookies.set({
		name: SESSION_COOKIE,
		value: '',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: 0,
	});
}
