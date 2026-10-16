import { describe, it, expect, afterEach } from 'vitest';
import { resolveCookieSecure } from '@/lib/auth/cookie-options';

/**
 * La marca `Secure` no puede depender rígidamente de `NODE_ENV=production`: un
 * despliegue sobre HTTP (IP pública sin TLS) descartaría la cookie y rompería el
 * inicio de sesión. `COOKIE_SECURE` permite forzarla y, si está vacía, se deduce
 * del esquema real de la petición.
 */

function request(url: string, headers: Record<string, string> = {}): Request {
	return new Request(url, { headers });
}

const original = process.env.COOKIE_SECURE;

afterEach(() => {
	if (original === undefined) delete process.env.COOKIE_SECURE;
	else process.env.COOKIE_SECURE = original;
});

describe('resolveCookieSecure', () => {
	it('COOKIE_SECURE=true fuerza Secure aunque la petición venga por HTTP', () => {
		process.env.COOKIE_SECURE = 'true';
		expect(resolveCookieSecure(request('http://54.86.22.45:3000/login'))).toBe(true);
	});

	it('COOKIE_SECURE=false desactiva Secure aunque la petición venga por HTTPS', () => {
		process.env.COOKIE_SECURE = 'false';
		expect(
			resolveCookieSecure(
				request('https://competicion.example/login', { 'x-forwarded-proto': 'https' }),
			),
		).toBe(false);
	});

	it('sin override, respeta X-Forwarded-Proto=https', () => {
		delete process.env.COOKIE_SECURE;
		expect(
			resolveCookieSecure(request('http://interno:3000/login', { 'x-forwarded-proto': 'https' })),
		).toBe(true);
	});

	it('sin override, no marca Secure sobre HTTP (IP pública sin TLS)', () => {
		delete process.env.COOKIE_SECURE;
		expect(resolveCookieSecure(request('http://54.86.22.45:3000/login'))).toBe(false);
	});

	it('sin override ni cabecera, usa el esquema de request.url', () => {
		delete process.env.COOKIE_SECURE;
		expect(resolveCookieSecure(request('https://competicion.example/login'))).toBe(true);
		expect(resolveCookieSecure(request('http://competicion.example/login'))).toBe(false);
	});
});
