import { describe, it, expect } from 'vitest';
import {
	canonicalizeValue,
	validateSelectorSubmission,
} from '@/lib/css/validator';
import { canonicalizeSelectorList, splitSelectors } from '@/lib/css/selector';

describe('selector canónico (comparación de entregas)', () => {
	it('ignora espacios y comentarios irrelevantes', () => {
		expect(canonicalizeSelectorList('  .boton   >  a ')).toBe('.boton > a');
		expect(canonicalizeSelectorList('.a/*c*/ .b')).toBe('.a .b');
	});

	it('distingue selectores distintos', () => {
		expect(canonicalizeSelectorList('.boton')).not.toBe(canonicalizeSelectorList('.otro'));
	});

	it('divide listas agrupadas respetando comas internas', () => {
		const result = splitSelectors('h1, h2, :is(h3, h4)');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.selectors.map((s) => s.raw)).toEqual(['h1', 'h2', ':is(h3, h4)']);
		}
	});
});

describe('canonicalizeValue', () => {
	it('ignora espacios y comentarios irrelevantes', () => {
		expect(canonicalizeValue('  red   solid ')).toBe('red solid');
		expect(canonicalizeValue('red /* nota */ solid')).toBe('red solid');
	});

	it('normaliza la caja de palabras y funciones', () => {
		expect(canonicalizeValue('RED')).toBe('red');
		// El espaciado alrededor de los separadores es irrelevante.
		expect(canonicalizeValue('RGB(1, 2, 3)')).toBe('rgb(1,2,3)');
		expect(canonicalizeValue('rgb(1,2,3)')).toBe('rgb(1,2,3)');
	});

	it('conserva el contenido exacto de las cadenas', () => {
		expect(canonicalizeValue('"Hola Mundo"')).toBe('"Hola Mundo"');
	});

	it('no reescribe números ni acorta colores hexadecimales', () => {
		expect(canonicalizeValue('1.0')).toBe('1.0');
		expect(canonicalizeValue('#fff')).not.toBe(canonicalizeValue('#ffffff'));
	});

	it('no equipara un valor con y sin !important', () => {
		expect(canonicalizeValue('red')).not.toBe(canonicalizeValue('red !important'));
	});
});

describe('validateSelectorSubmission', () => {
	const selector = '.boton';

	it('acepta un bloque correcto y devuelve declaraciones canónicas', () => {
		const result = validateSelectorSubmission(
			'.boton { color: RED; padding: 8px 16px; }',
			selector,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.declarations).toEqual([
				{ property: 'color', value: 'red' },
				{ property: 'padding', value: '8px 16px' },
			]);
		}
	});

	it('rechaza un CSS sintácticamente inválido', () => {
		// Bloque sin cerrar: PostCSS no puede analizarlo.
		expect(validateSelectorSubmission('.boton {', selector)).toEqual({
			ok: false,
			reason: 'invalid_css',
		});
		// Declaración sin valor: no es una entrega válida.
		expect(validateSelectorSubmission('.boton { color: }', selector).ok).toBe(false);
	});

	it('rechaza cuando faltan llaves o el bloque está vacío', () => {
		expect(validateSelectorSubmission('.boton {}', selector)).toEqual({
			ok: false,
			reason: 'empty',
		});
		expect(validateSelectorSubmission('color: red;', selector)).toEqual({
			ok: false,
			reason: 'invalid_css',
		});
	});

	it('rechaza un selector distinto', () => {
		const result = validateSelectorSubmission('.otro { color: red; }', selector);
		expect(result).toEqual({ ok: false, reason: 'wrong_selector' });
	});

	it('acepta variaciones de formato del selector autorizado', () => {
		const result = validateSelectorSubmission('div>h1 { color: red; }', 'div > h1');
		expect(result.ok).toBe(true);
	});

	it('rechaza un selector autorizado con lista añadida', () => {
		const result = validateSelectorSubmission('h1, h2 { color: red; }', 'h1');
		expect(result).toEqual({ ok: false, reason: 'wrong_selector' });
	});

	it('rechaza reglas adicionales', () => {
		const result = validateSelectorSubmission(
			'.boton { color: red; }\n.otro { color: blue; }',
			selector,
		);
		expect(result).toEqual({ ok: false, reason: 'extra_rules' });
	});

	it('rechaza at-rules y estructuras anidadas', () => {
		expect(validateSelectorSubmission('@media screen { .boton { color: red; } }', selector)).toEqual({
			ok: false,
			reason: 'unexpected_structure',
		});
		expect(validateSelectorSubmission('.boton { &:hover { color: red; } }', selector)).toEqual({
			ok: false,
			reason: 'unexpected_structure',
		});
	});

	it('rechaza propiedades duplicadas', () => {
		const result = validateSelectorSubmission('.boton { color: red; color: blue; }', selector);
		expect(result).toEqual({ ok: false, reason: 'duplicate_property' });
	});

	it('rechaza entradas sobredimensionadas', () => {
		const huge = `.boton { content: "${'x'.repeat(600)}"; }`;
		expect(validateSelectorSubmission(huge, selector)).toEqual({ ok: false, reason: 'too_large' });
		expect(validateSelectorSubmission('', selector)).toEqual({ ok: false, reason: 'empty' });
	});

	it('ignora propiedades no contempladas por las reglas (crédito parcial)', () => {
		const result = validateSelectorSubmission(
			'.boton { color: red; font-family: Arial; }',
			selector,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.declarations).toHaveLength(2);
		}
	});
});
