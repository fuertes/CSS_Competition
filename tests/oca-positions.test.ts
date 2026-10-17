import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { classifyRoute } from '@/lib/auth/route-guards';
import { OCA_BOARD_SIZE, OCA_INITIAL_POSITION, isValidOcaBoardNumber } from '@/lib/oca/board';

/**
 * Invariantes de la Fase 3 (tablero y posiciones) que no son puras: combinan
 * comprobaciones de configuración con lectura de fuentes. No se conecta a ninguna
 * base de datos real ni se ejecutan scripts que escriban datos.
 */

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

const API_ROUTE = 'src/app/api/admin/oca/games/route.ts';
const ADMIN_PAGE = 'src/app/admin/oca/page.tsx';
const GROUP_PAGE = 'src/app/(site)/oca/page.tsx';

describe('posiciones — reglas de validación', () => {
	it('la posición inicial y las válidas pertenecen al tablero de 40 casillas', () => {
		expect(OCA_INITIAL_POSITION).toBe(1);
		expect(isValidOcaBoardNumber(OCA_INITIAL_POSITION)).toBe(true);
		expect(isValidOcaBoardNumber(OCA_BOARD_SIZE)).toBe(true);
		expect(isValidOcaBoardNumber(OCA_BOARD_SIZE + 1)).toBe(false);
		expect(isValidOcaBoardNumber(0)).toBe(false);
	});
});

describe('posiciones — ningún mecanismo de movimiento en esta fase', () => {
	it('la capa de datos de La Oca no actualiza posiciones (solo lectura)', () => {
		const ocaData = read('src/lib/data/oca.ts').toLowerCase();
		expect(ocaData).not.toMatch(/\bupdate\s+public\./);
		expect(ocaData).not.toMatch(/\bupdate\s+oca_/);
	});

	it('la API docente no acepta posiciones ni mecánicas de juego', () => {
		const route = read(API_ROUTE);
		expect(route).not.toMatch(/\bposition\b\s*:/);
		expect(route.toLowerCase()).not.toMatch(/\b(move|mover|turno|dado|dice|roll)\b/);
	});

	it('no existen Route Handlers de La Oca distintos del listado docente', () => {
		// El área de grupo consulta la base de datos desde su Server Component;
		// en la API solo existe el listado de partidas del panel docente.
		expect(collectRouteHandlers('src/app/api/oca')).toEqual([]);
		expect(collectRouteHandlers('src/app/api/admin/oca')).toEqual(['src/app/api/admin/oca/games/route.ts']);
	});
});

/** Localiza los `route.ts` de un árbol, con rutas separadas por `/`. */
function collectRouteHandlers(relativeDir: string): string[] {
	const base = join(root, relativeDir);
	if (!existsSync(base)) return [];

	const found: string[] = [];
	const walk = (current: string) => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name === 'route.ts') found.push(full.slice(root.length + 1).split(sep).join('/'));
		}
	};
	walk(base);
	return found;
}

describe('seguridad — sesión en las rutas de La Oca', () => {
	it('las rutas existentes requieren la sesión correcta', () => {
		const admin = classifyRoute('/admin/oca');
		expect(admin.adminPage).toBe(true);
		expect(admin.groupPage).toBe(false);

		const group = classifyRoute('/oca');
		expect(group.groupPage).toBe(true);
		expect(group.adminPage).toBe(false);

		expect(classifyRoute(API_ROUTE.replace('src/app', '').replace('/route.ts', '')).adminApi).toBe(true);
	});

	it('la API docente vuelve a comprobar la identidad y responde 401 sin sesión', () => {
		const route = read(API_ROUTE);
		expect(route).toContain('getRequestUserId');
		expect(route).toContain("errorResponse('No autorizado.', 401)");
	});

	it('las vistas de La Oca no exponen credenciales ni tablas de CSS', () => {
		const text = (read(API_ROUTE) + read(ADMIN_PAGE) + read(GROUP_PAGE)).toLowerCase();
		for (const secret of ['database_url', 'access_code', 'password']) {
			expect(text).not.toContain(secret);
		}
		for (const table of ['group_scores', 'scoring_events', 'competition_rounds', 'group_attempts']) {
			expect(text).not.toContain(table);
		}
	});

	it('la vista del grupo lee su identificador de la sesión, nunca del cliente', () => {
		const groupPage = read(GROUP_PAGE);
		expect(groupPage).toContain('getRequestGroupId');
		expect(groupPage).not.toMatch(/searchParams/);
		expect(groupPage).not.toMatch(/groupId\s*=\s*['"]\$/);
	});
});
