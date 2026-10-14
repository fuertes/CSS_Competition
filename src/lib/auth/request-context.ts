import 'server-only';
import { headers } from 'next/headers';

/**
 * Identidad de la petición autenticada.
 *
 * El `proxy` verifica la cookie de sesión (administrador o grupo) y añade los
 * encabezados internos `x-user-id` / `x-group-id` a la petición. Estos
 * encabezados los elimina y reescribe siempre el proxy, de modo que un cliente
 * no puede falsificarlos. Las páginas y Route Handlers leen aquí la identidad
 * ya verificada en lugar de repetir la consulta a la base de datos.
 */
export interface AuthContext {
	userId: string | null;
	groupId: string | null;
}

export async function getAuthContext(): Promise<AuthContext> {
	const headerList = await headers();
	return {
		userId: headerList.get('x-user-id'),
		groupId: headerList.get('x-group-id'),
	};
}

export async function getRequestUserId(): Promise<string | null> {
	return (await getAuthContext()).userId;
}

export async function getRequestGroupId(): Promise<string | null> {
	return (await getAuthContext()).groupId;
}
