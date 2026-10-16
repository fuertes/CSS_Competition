import { describe, it, expect } from 'vitest';
import { classifyRoute } from '@/lib/auth/route-guards';

/**
 * La clasificación de rutas decide qué áreas protege el `proxy`. Estas pruebas
 * fijan los permisos de las rutas existentes (CSS Competition) y de las nuevas
 * áreas de La Oca, sin arrancar la aplicación ni tocar la base de datos.
 */
describe('classifyRoute — áreas protegidas', () => {
	const adminPages = ['/admin', '/admin/css', '/admin/oca', '/admin/oca/partidas'];
	const adminApis = [
		'/api/admin',
		'/api/admin/groups',
		'/api/admin/oca',
		'/api/admin/oca/partidas',
		'/api/admin/oca/games',
	];
	const groupPages = ['/oca', '/oca/tablero', '/competicion', '/competicion/oca'];
	const groupApis = [
		'/api/oca',
		'/api/oca/estado',
		'/api/oca/games',
		'/api/competicion/estado',
		'/api/competicion/entregar',
	];

	it.each(adminPages)('%s exige sesión de administrador', (pathname) => {
		const areas = classifyRoute(pathname);
		expect(areas.adminPage).toBe(true);
		expect(areas.adminApi).toBe(false);
		expect(areas.groupPage).toBe(false);
		expect(areas.groupApi).toBe(false);
	});

	it.each(adminApis)('%s exige sesión de administrador (API)', (pathname) => {
		const areas = classifyRoute(pathname);
		expect(areas.adminApi).toBe(true);
		expect(areas.adminPage).toBe(false);
		expect(areas.groupPage).toBe(false);
		expect(areas.groupApi).toBe(false);
	});

	it.each(groupPages)('%s exige sesión de grupo', (pathname) => {
		const areas = classifyRoute(pathname);
		expect(areas.groupPage).toBe(true);
		expect(areas.groupApi).toBe(false);
		expect(areas.adminPage).toBe(false);
		expect(areas.adminApi).toBe(false);
	});

	it.each(groupApis)('%s exige sesión de grupo (API)', (pathname) => {
		const areas = classifyRoute(pathname);
		expect(areas.groupApi).toBe(true);
		expect(areas.groupPage).toBe(false);
		expect(areas.adminPage).toBe(false);
		expect(areas.adminApi).toBe(false);
	});

	it('el panel docente y el área de grupos son mutuamente excluyentes', () => {
		expect(classifyRoute('/admin/oca').adminPage).toBe(true);
		expect(classifyRoute('/admin/oca').groupPage).toBe(false);
		expect(classifyRoute('/oca').groupPage).toBe(true);
		expect(classifyRoute('/oca').adminPage).toBe(false);
	});

	it('conserva el acceso público de entrada de la competición', () => {
		expect(classifyRoute('/competicion/entrar').groupPage).toBe(false);
		expect(classifyRoute('/competicion/entrar/cualquiera').groupPage).toBe(false);
		expect(classifyRoute('/api/competicion/entrar').groupApi).toBe(false);
	});

	it.each(['/', '/login', '/ranking', '/alumnos', '/api/ranking', '/api/auth/signin'])(
		'%s se considera pública (no requiere sesión)',
		(pathname) => {
			const areas = classifyRoute(pathname);
			expect(areas.adminPage || areas.adminApi || areas.groupPage || areas.groupApi).toBe(false);
		},
	);

	it('no confunde prefijos parecidos con rutas del área', () => {
		expect(classifyRoute('/administracion').adminPage).toBe(false);
		expect(classifyRoute('/ocasion').groupPage).toBe(false);
		expect(classifyRoute('/api/ocasion').groupApi).toBe(false);
	});
});
