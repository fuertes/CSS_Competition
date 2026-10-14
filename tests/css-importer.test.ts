import { describe, it, expect } from 'vitest';
import {
	analyzeCss,
	validateImportPayload,
	DEFAULT_IMPORT_LIMITS,
	type ImportSelector,
} from '@/lib/css/importer';
import { canonicalizeValue } from '@/lib/css/validator';

/** Devuelve el selector con el texto dado, o lanza si no existe. */
function pick(selectors: ImportSelector[], selector: string): ImportSelector {
	const found = selectors.find((item) => item.selector === selector);
	if (!found) throw new Error(`No se encontró el selector ${selector}`);
	return found;
}

describe('analyzeCss: casos básicos', () => {
	it('importa un único selector con varias propiedades', () => {
		const result = analyzeCss(`.boton {
			display: flex;
			background-color: white;
			justify-content: center;
			padding: 12px 20px;
		}`);
		expect(result.ok).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.stats).toEqual({ selectorCount: 1, declarationCount: 4 });
		const button = pick(result.selectors, '.boton');
		expect(button.declarations).toEqual([
			{ name: 'display', expectedValue: 'flex' },
			{ name: 'background-color', expectedValue: 'white' },
			{ name: 'justify-content', expectedValue: 'center' },
			{ name: 'padding', expectedValue: '12px 20px' },
		]);
	});

	it('importa varios selectores conservando el orden', () => {
		const result = analyzeCss(`.tarjeta { border-radius: 12px; }
			.titulo { font-size: 24px; }
			.boton { padding: 8px; }`);
		expect(result.ok).toBe(true);
		expect(result.selectors.map((item) => item.selector)).toEqual([
			'.tarjeta',
			'.titulo',
			'.boton',
		]);
		expect(result.stats.selectorCount).toBe(3);
	});

	it('analiza reglas escritas en una sola línea', () => {
		const result = analyzeCss('.a { color: red; padding: 1px; }');
		expect(result.ok).toBe(true);
		expect(result.stats).toEqual({ selectorCount: 1, declarationCount: 2 });
	});

	it('analiza reglas con saltos de línea y comentarios', () => {
		const result = analyzeCss(`/* cabecera */
		.a {
			color: red; /* en línea */
			padding: 1px;
		}`);
		expect(result.ok).toBe(true);
		expect(result.stats).toEqual({ selectorCount: 1, declarationCount: 2 });
		expect(pick(result.selectors, '.a').declarations).toEqual([
			{ name: 'color', expectedValue: 'red' },
			{ name: 'padding', expectedValue: '1px' },
		]);
	});

	it('preserva valores compuestos', () => {
		const result = analyzeCss(
			`.a { padding: 12px 20px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); width: calc(100% - 10px); font-family: "Helvetica Neue", Arial, sans-serif; }`,
		);
		expect(result.ok).toBe(true);
		const rules = pick(result.selectors, '.a').declarations;
		expect(rules).toContainEqual({ name: 'padding', expectedValue: '12px 20px' });
		expect(rules).toContainEqual({
			name: 'box-shadow',
			expectedValue: '0 1px 2px rgba(0, 0, 0, 0.2)',
		});
		expect(rules).toContainEqual({ name: 'width', expectedValue: 'calc(100% - 10px)' });
		expect(rules).toContainEqual({
			name: 'font-family',
			expectedValue: '"Helvetica Neue", Arial, sans-serif',
		});
	});
});

describe('analyzeCss: listas agrupadas', () => {
	it('divide las listas y asocia las declaraciones a cada selector', () => {
		const result = analyzeCss(`h1, h2 {
			color: red;
			margin-bottom: 10px;
		}`);
		expect(result.ok).toBe(true);
		expect(result.selectors.map((item) => item.selector)).toEqual(['h1', 'h2']);
		for (const selector of result.selectors) {
			expect(selector.declarations).toEqual([
				{ name: 'color', expectedValue: 'red' },
				{ name: 'margin-bottom', expectedValue: '10px' },
			]);
		}
	});

	it('divide h1, h2, :is(h3, h4) en tres unidades', () => {
		const result = analyzeCss('h1, h2, :is(h3, h4) { color: red; }');
		expect(result.ok).toBe(true);
		expect(result.selectors.map((item) => item.selector)).toEqual(['h1', 'h2', ':is(h3, h4)']);
	});
});

describe('analyzeCss: duplicados', () => {
	it('detecta declaraciones duplicadas y conserva el último valor', () => {
		const result = analyzeCss('.a { color: red; color: blue; }');
		expect(result.ok).toBe(true);
		expect(pick(result.selectors, '.a').declarations).toEqual([
			{ name: 'color', expectedValue: 'blue' },
		]);
		expect(result.warnings.some((message) => message.includes('duplicada'))).toBe(true);
	});

	it('detecta selectores repetidos y los fusiona', () => {
		const result = analyzeCss('.a { color: red; } .a { padding: 1px; }');
		expect(result.ok).toBe(true);
		expect(result.stats.selectorCount).toBe(1);
		expect(pick(result.selectors, '.a').declarations).toEqual([
			{ name: 'color', expectedValue: 'red' },
			{ name: 'padding', expectedValue: '1px' },
		]);
		expect(result.warnings.some((message) => message.includes('repetido'))).toBe(true);
	});
});

describe('analyzeCss: errores', () => {
	it('detecta errores sintácticos', () => {
		expect(analyzeCss('.a { color: red;').ok).toBe(false);
		expect(analyzeCss('.a,,.b { color: red; }').ok).toBe(false);
	});

	it('rechaza construcciones no admitidas', () => {
		const at = analyzeCss('@media screen { .a { color: red; } }');
		expect(at.ok).toBe(false);
		expect(at.errors.some((message) => message.includes('@media'))).toBe(true);

		const nested = analyzeCss('.a { &:hover { color: red; } }');
		expect(nested.ok).toBe(false);
	});

	it('rechaza entradas excesivamente grandes', () => {
		const huge = `.a { content: "${'x'.repeat(DEFAULT_IMPORT_LIMITS.maxCssChars)}"; }`;
		const result = analyzeCss(huge);
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toContain('límite');
	});

	it('rechaza un bloque sin selectores con declaraciones', () => {
		const result = analyzeCss('/* solo comentarios */');
		expect(result.ok).toBe(false);
	});

	it('avisa y omite un selector sin declaraciones', () => {
		const result = analyzeCss('.a { color: red; } .vacio {}');
		expect(result.ok).toBe(true);
		expect(result.stats.selectorCount).toBe(1);
		expect(result.warnings.some((message) => message.includes('declaraciones'))).toBe(true);
	});
});

describe('validateImportPayload: revalidación en servidor', () => {
	it('recalcula el valor canónico y aplica los puntos base', () => {
		const result = validateImportPayload(
			[{ selector: '.a', declarations: [{ name: 'Color', expectedValue: 'RED' }] }],
			10,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.selectors).toHaveLength(1);
			expect(result.selectors[0]!.rules).toEqual([
				{ property: 'color', expectedCanonical: canonicalizeValue('RED'), points: 10 },
			]);
		}
	});

	it('respeta los puntos indicados por declaración', () => {
		const result = validateImportPayload(
			[{ selector: '.a', declarations: [{ name: 'color', expectedValue: 'red', points: 25 }] }],
			10,
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.selectors[0]!.rules[0]!.points).toBe(25);
	});

	it('rechaza un selector con lista (debe ser unidad única)', () => {
		const result = validateImportPayload(
			[{ selector: 'h1, h2', declarations: [{ name: 'color', expectedValue: 'red' }] }],
			10,
		);
		expect(result.ok).toBe(false);
	});

	it('rechaza selectores repetidos', () => {
		const result = validateImportPayload(
			[
				{ selector: '.a', declarations: [{ name: 'color', expectedValue: 'red' }] },
				{ selector: '.a', declarations: [{ name: 'padding', expectedValue: '1px' }] },
			],
			10,
		);
		expect(result.ok).toBe(false);
	});

	it('rechaza una propiedad no válida', () => {
		const result = validateImportPayload(
			[{ selector: '.a', declarations: [{ name: 'colo r', expectedValue: 'red' }] }],
			10,
		);
		expect(result.ok).toBe(false);
	});

	it('rechaza un valor vacío', () => {
		const result = validateImportPayload(
			[{ selector: '.a', declarations: [{ name: 'color', expectedValue: '   ' }] }],
			10,
		);
		expect(result.ok).toBe(false);
	});

	it('acepta propiedades personalizadas (--var)', () => {
		const result = validateImportPayload(
			[{ selector: ':root', declarations: [{ name: '--margen', expectedValue: '8px' }] }],
			5,
		);
		expect(result.ok).toBe(true);
	});
});
