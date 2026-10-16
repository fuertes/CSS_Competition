import { describe, it, expect } from 'vitest';
import { relativeRedirect } from '@/lib/http';

/**
 * El flujo de autenticación debe navegar con rutas RELATIVAS: un `Location`
 * absoluto obligaría a reconstruir el host (y podría filtrar `localhost`).
 */
describe('relativeRedirect', () => {
	it('emite un Location relativo, nunca una URL absoluta', () => {
		const response = relativeRedirect('/login?error=datos');
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/login?error=datos');
		expect(response.headers.get('location')?.startsWith('http')).toBe(false);
	});

	it('permite indicar el código de estado', () => {
		expect(relativeRedirect('/x', 307).status).toBe(307);
	});
});
