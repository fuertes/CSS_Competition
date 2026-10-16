import { describe, it, expect } from 'vitest';
import { getRequestHost } from '@/lib/request-origin';

/**
 * `getRequestHost` se usa para la comprobación de mismo origen (CSRF) del
 * `proxy`. Debe reconocer el host público enviado por un proxy inverso.
 */

function request(url: string, headers: Record<string, string> = {}): Request {
	return new Request(url, { headers });
}

describe('getRequestHost', () => {
	it('prioriza la cabecera Host', () => {
		expect(getRequestHost(request('http://interno:3000/', { host: '54.86.22.45:3000' }))).toBe(
			'54.86.22.45:3000',
		);
	});

	it('usa X-Forwarded-Host cuando falta Host', () => {
		expect(
			getRequestHost(request('http://interno:3000/', { 'x-forwarded-host': 'competicion.example' })),
		).toBe('competicion.example');
	});

	it('toma el primer valor de una cabecera repetida en lista', () => {
		expect(
			getRequestHost(request('http://interno:3000/', { host: 'publico.example, interno:3000' })),
		).toBe('publico.example');
	});

	it('devuelve null si no hay ninguna cabecera de host', () => {
		expect(getRequestHost(request('http://interno:3000/'))).toBe(null);
	});
});
