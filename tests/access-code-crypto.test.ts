import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
	decryptAccessCodeWithKey,
	deriveAccessCodeKey,
	encryptAccessCodeWithKey,
} from '@/lib/crypto/access-code';

const KEY = randomBytes(32);

describe('deriveAccessCodeKey', () => {
	it('acepta una clave de 32 bytes en base64', () => {
		expect(deriveAccessCodeKey(KEY.toString('base64'))?.length).toBe(32);
	});

	it('acepta una clave de 32 bytes en hexadecimal', () => {
		expect(deriveAccessCodeKey(KEY.toString('hex'))?.length).toBe(32);
	});

	it('rechaza claves ausentes, vacías o de longitud incorrecta sin lanzar', () => {
		expect(deriveAccessCodeKey(undefined)).toBeNull();
		expect(deriveAccessCodeKey(null)).toBeNull();
		expect(deriveAccessCodeKey('')).toBeNull();
		expect(deriveAccessCodeKey('   ')).toBeNull();
		expect(deriveAccessCodeKey('corta')).toBeNull();
		expect(deriveAccessCodeKey(randomBytes(16).toString('base64'))).toBeNull();
	});
});

describe('cifrado recuperable del código de acceso', () => {
	it('recupera exactamente el código original (ida y vuelta)', () => {
		const code = 'ABCD2345';
		const payload = encryptAccessCodeWithKey(KEY, code);
		expect(payload).not.toContain(code);
		expect(decryptAccessCodeWithKey(KEY, payload)).toBe(code);
	});

	it('usa un nonce único: dos cifrados del mismo código difieren y ambos se recuperan', () => {
		const a = encryptAccessCodeWithKey(KEY, 'ABCD2345');
		const b = encryptAccessCodeWithKey(KEY, 'ABCD2345');
		expect(a).not.toBe(b);
		expect(decryptAccessCodeWithKey(KEY, a)).toBe('ABCD2345');
		expect(decryptAccessCodeWithKey(KEY, b)).toBe('ABCD2345');
	});

	it('detecta datos manipulados (cifrado autenticado) y devuelve null', () => {
		const payload = encryptAccessCodeWithKey(KEY, 'ABCD2345');
		const bytes = Buffer.from(payload, 'base64');
		bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
		expect(decryptAccessCodeWithKey(KEY, bytes.toString('base64'))).toBeNull();
	});

	it('rechaza una clave distinta (clave incorrecta) sin lanzar', () => {
		const payload = encryptAccessCodeWithKey(KEY, 'ABCD2345');
		expect(decryptAccessCodeWithKey(randomBytes(32), payload)).toBeNull();
	});

	it('trata como no recuperable una carga vacía, corta o ausente', () => {
		expect(decryptAccessCodeWithKey(KEY, '')).toBeNull();
		expect(decryptAccessCodeWithKey(KEY, 'AAAA')).toBeNull();
		expect(decryptAccessCodeWithKey(KEY, 'no-es-base64-###')).toBeNull();
	});
});
