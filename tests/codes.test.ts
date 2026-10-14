import { describe, it, expect } from 'vitest';
import { normalizeCode, generateAccessCode } from '@/lib/codes';

describe('normalizeCode', () => {
	it('recorta espacios y pasa a mayúsculas', () => {
		expect(normalizeCode('  abc-def  ')).toBe('ABC-DEF');
		expect(normalizeCode('solo')).toBe('SOLO');
	});

	it('deja invariantes los códigos ya normalizados', () => {
		expect(normalizeCode('ABC-123')).toBe('ABC-123');
	});
});

describe('generateAccessCode', () => {
	it('genera códigos de la longitud pedida dentro de los límites', () => {
		expect(generateAccessCode(6)).toHaveLength(6);
		expect(generateAccessCode(10)).toHaveLength(10);
	});

	it('limita la longitud entre 4 y 24', () => {
		expect(generateAccessCode(1)).toHaveLength(4);
		expect(generateAccessCode(2)).toHaveLength(4);
		expect(generateAccessCode(60)).toHaveLength(24);
	});

	it('solo usa caracteres no ambiguos del alfabeto definido', () => {
		const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
		for (let i = 0; i < 100; i += 1) {
			const code = generateAccessCode(8);
			expect(code).toMatch(new RegExp(`^[${alphabet}]+$`));
		}
	});

	it('devuelve códigos variables entre llamadas', () => {
		expect(generateAccessCode(8)).not.toBe(generateAccessCode(8));
	});
});