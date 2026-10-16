/**
 * Clasificación de rutas del `proxy`. Módulo puro (sin Next.js ni base de
 * datos) para poder probar los permisos sin arrancar la aplicación.
 *
 * Áreas protegidas:
 *  - **Panel docente**: `/admin/**` y `/api/admin/**` exigen sesión de
 *    administrador.
 *  - **Competición por grupos (CSS)**: `/competicion/**` y `/api/competicion/**`
 *    exigen sesión de grupo, salvo los accesos públicos de entrada.
 *  - **La Oca del Caos**: `/oca/**` y `/api/oca/**` exigen sesión de grupo
 *    (reutiliza la sesión de la competición; no hay un acceso propio).
 *
 * Cualquier ruta que no pertenezca a estas áreas se considera pública y el
 * `proxy` la deja pasar sin verificar sesión.
 */

/** ¿La ruta es `base` o un descendiente suyo (`base/...`)? */
function isUnder(pathname: string, base: string): boolean {
	return pathname === base || pathname.startsWith(`${base}/`);
}

/** Páginas del panel docente. */
export function isAdminPage(pathname: string): boolean {
	return isUnder(pathname, '/admin');
}

/** Endpoints del panel docente. */
export function isAdminApi(pathname: string): boolean {
	return isUnder(pathname, '/api/admin');
}

/** Acceso público de grupo (página de entrada de la competición). */
export function isGroupLoginPage(pathname: string): boolean {
	return isUnder(pathname, '/competicion/entrar');
}

/** Acceso público de grupo (endpoint de entrada de la competición). */
export function isGroupLoginApi(pathname: string): boolean {
	return pathname === '/api/competicion/entrar';
}

/** Páginas que requieren sesión de grupo (competición CSS y La Oca). */
export function isGroupPage(pathname: string): boolean {
	if (isUnder(pathname, '/oca')) return true;
	return isUnder(pathname, '/competicion') && !isGroupLoginPage(pathname);
}

/** Endpoints que requieren sesión de grupo (competición CSS y La Oca). */
export function isGroupApi(pathname: string): boolean {
	if (isUnder(pathname, '/api/oca')) return true;
	return isUnder(pathname, '/api/competicion') && !isGroupLoginApi(pathname);
}

export interface RouteAreas {
	adminPage: boolean;
	adminApi: boolean;
	groupPage: boolean;
	groupApi: boolean;
}

/**
 * Clasifica una ruta en las áreas protegidas. Si las cuatro marcas son `false`,
 * la ruta es pública.
 */
export function classifyRoute(pathname: string): RouteAreas {
	return {
		adminPage: isAdminPage(pathname),
		adminApi: isAdminApi(pathname),
		groupPage: isGroupPage(pathname),
		groupApi: isGroupApi(pathname),
	};
}
