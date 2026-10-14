import type { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { createSessionToken, hashSessionToken } from '@/lib/auth/session';

export const GROUP_SESSION_COOKIE = 'competicion_session';
/** Duración de la sesión de un grupo (una jornada de competición, 6 horas). */
export const GROUP_SESSION_TTL_SECONDS = 6 * 60 * 60;

export interface GroupSessionUser {
	id: string;
	name: string;
	color: string;
}

/** Genera el token aleatorio de la sesión de grupo (32 bytes, base64url). */
export function createGroupSessionToken(): string {
	return createSessionToken();
}

/** Hash SHA-256 del token, que es lo único que se guarda en la base de datos. */
export function hashGroupSessionToken(token: string): string {
	return hashSessionToken(token);
}

/**
 * Valida un token de sesión de grupo contra la base de datos. Devuelve el
 * grupo asociado o `null` si la sesión no existe, caducó, fue revocada o el
 * grupo no está activo.
 */
export async function verifyGroupSession(
	token: string | null | undefined,
): Promise<GroupSessionUser | null> {
	if (!token) return null;
	const pool = getPool();
	if (!pool) return null;

	try {
		const { rows } = await pool.query<{
			group_id: string;
			name: string;
			color: string;
			active: boolean;
			expires_at: Date;
		}>(
			`select gs.group_id, g.name, g.color, g.active, gs.expires_at
			 from public.group_sessions gs
			 join public.groups g on g.id = gs.group_id
			 where gs.token_hash = $1 and gs.revoked_at is null
			 limit 1`,
			[hashSessionToken(token)],
		);
		const row = rows[0];
		if (!row) return null;
		if (!row.active) return null;
		if (row.expires_at.getTime() <= Date.now()) return null;

		// Mantiene last_used_at fresco sin bloquear (best effort).
		await pool
			.query('update public.group_sessions set last_used_at = now() where token_hash = $1', [
				hashSessionToken(token),
			])
			.catch(() => undefined);

		return { id: row.group_id, name: row.name, color: row.color };
	} catch (error) {
		console.error('[group-session] No se pudo verificar la sesión:', error);
		return null;
	}
}

/** Revoca la sesión (cierre de sesión). */
export async function revokeGroupSession(token: string | null | undefined): Promise<void> {
	if (!token) return;
	const pool = getPool();
	if (!pool) return;
	try {
		await pool.query(
			'update public.group_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null',
			[hashSessionToken(token)],
		);
	} catch (error) {
		console.error('[group-session] No se pudo revocar la sesión:', error);
	}
}

/**
 * Escribe la cookie de sesión de grupo en la respuesta. `Secure` se activa en
 * producción (HTTPS).
 */
export function setGroupSessionCookie(response: NextResponse, token: string): void {
	response.cookies.set({
		name: GROUP_SESSION_COOKIE,
		value: token,
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: GROUP_SESSION_TTL_SECONDS,
	});
}

export function clearGroupSessionCookie(response: NextResponse): void {
	response.cookies.set({
		name: GROUP_SESSION_COOKIE,
		value: '',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: 0,
	});
}
