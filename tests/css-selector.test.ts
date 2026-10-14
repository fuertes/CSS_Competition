import { describe, it, expect } from 'vitest';
import {
	splitSelectors,
	canonicalizeSelectorList,
	selectorsEqual,
} from '@/lib/css/selector';

/** Devuelve las representaciones originales de una lista, o lanza si es inválida. */
function raws(input: string): string[] {
	const result = splitSelectors(input);
	if (!result.ok) throw new Error(`Selector inválido: ${input} (${result.reason})`);
	return result.selectors.map((selector) => selector.raw);
}

describe('splitSelectors: tipos de selector admitidos', () => {
	const cases = [
		'div',
		'h1',
		'#principal',
		'.boton',
		'div p',
		'section article p',
		'div > h1',
		'ul > li',
		'h1 + p',
		'h2 ~ p',
		'div.tarjeta',
		'#principal .boton',
		'nav ul > li a',
		'input[type="text"]',
		'a[target="_blank"]',
		'[class~="activo"]',
		'button:hover',
		'input:focus',
		'li:first-child',
		'p:not(.destacado)',
		'p::first-line',
		'.boton::before',
		'.boton::after',
		':has(> img)',
		':where(.a, .b)',
		'li:nth-child(2n+1)',
		'a[href^="https://"]:hover',
		'*',
		'.boton, .tarjeta',
	];

	it.each(cases)('admisión de "%s"', (input) => {
		const result = splitSelectors(input);
		expect(result.ok).toBe(true);
	});

	it('admite escapes CSS en el selector', () => {
		const result = splitSelectors('.foo\\:bar');
		expect(result.ok).toBe(true);
	});
});

describe('splitSelectors: listas agrupadas y comas internas', () => {
	it('divide h1, h2, :is(h3, h4) en tres selectores', () => {
		expect(raws('h1, h2, :is(h3, h4)')).toEqual(['h1', 'h2', ':is(h3, h4)']);
	});

	it('no confunde la coma interna de :is() con un separador', () => {
		const result = splitSelectors(':is(h1, h2, h3)');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.selectors).toHaveLength(1);
	});

	it('no confunde comas dentro de atributos con cadenas', () => {
		const result = splitSelectors('[data-x="a,b"], .y');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.selectors).toHaveLength(2);
	});
});

describe('splitSelectors: errores', () => {
	it('rechaza la entrada vacía', () => {
		expect(splitSelectors('   ')).toEqual({ ok: false, reason: 'empty' });
	});

	it('rechaza un selector sintácticamente inválido', () => {
		expect(splitSelectors(':is(').ok).toBe(false);
		expect(splitSelectors('div >').ok).toBe(false);
		expect(splitSelectors('> div').ok).toBe(false);
		expect(splitSelectors('.a,,.b').ok).toBe(false);
	});
});

describe('canonicalizeSelectorList: equivalencia de formato', () => {
	it('ignora espacios alrededor de combinadores', () => {
		expect(canonicalizeSelectorList('div>h1')).toBe(canonicalizeSelectorList('div > h1'));
	});

	it('normaliza espacios del combinador descendiente', () => {
		expect(canonicalizeSelectorList('.a   .b')).toBe('.a .b');
		expect(canonicalizeSelectorList('.a .b')).toBe('.a .b');
	});

	it('normaliza el espaciado interno de los atributos', () => {
		expect(canonicalizeSelectorList('a[ target = "_blank" ]')).toBe(
			canonicalizeSelectorList('a[target="_blank"]'),
		);
	});

	it('elimina comentarios de unión sin introducir espacio', () => {
		expect(canonicalizeSelectorList('h1/*c*/p')).toBe('h1p');
		expect(canonicalizeSelectorList('div/*c*/ p')).toBe('div p');
	});

	it('normaliza la lista agrupada', () => {
		expect(canonicalizeSelectorList('h1, h2')).toBe(canonicalizeSelectorList('h1,h2'));
	});

	it('no equipara selectores distintos', () => {
		expect(canonicalizeSelectorList('.boton')).not.toBe(canonicalizeSelectorList('.tarjeta'));
		expect(canonicalizeSelectorList('h1')).not.toBe(canonicalizeSelectorList('h1, h2'));
	});
});

describe('selectorsEqual', () => {
	it('compara por forma canónica', () => {
		expect(selectorsEqual('div > h1', 'div>h1')).toBe(true);
		expect(selectorsEqual('.a', '.b')).toBe(false);
		expect(selectorsEqual(':is(', 'h1')).toBe(false);
	});
});
