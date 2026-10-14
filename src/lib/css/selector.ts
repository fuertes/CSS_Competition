import selectorParser from 'postcss-selector-parser';

/**
 * Motor de selectores CSS de la competición.
 *
 * Usa `postcss-selector-parser` (nunca expresiones regulares) para:
 *  - dividir listas de selectores respetando las comas internas de `:is()`,
 *    `:where()`, `:not()`, atributos con cadenas, etc.;
 *  - validar la estructura sintáctica de cada selector;
 *  - obtener una forma canónica estable que solo normaliza el formato
 *    irrelevante (espacios, comentarios), sin alterar la semántica.
 *
 * La forma canónica se usa tanto en la importación (para detectar selectores
 * repetidos) como en la validación de entregas (para comprobar que el selector
 * enviado corresponde exactamente al selector autorizado).
 */

export interface ParsedSelector {
	/** Texto original del selector, recortado. Se muestra al profesor/alumno. */
	raw: string;
	/** Representación canónica estable para comparar. */
	canonical: string;
}

export type SelectorParseResult =
	| { ok: true; selectors: ParsedSelector[] }
	| { ok: false; reason: 'empty' | 'invalid_selector' };

/**
 * Nodo del AST de postcss-selector-parser. Definimos la forma mínima que
 * consumimos para no depender de los tipos internos del paquete (que usa
 * `export =`). Los nodos reales exponen `toString()`.
 */
interface AstNode {
	type: string;
	value?: string;
	attribute?: string;
	operator?: string;
	quoteMark?: string | null;
	insensitive?: boolean;
	raws?: { value?: string };
	nodes?: AstNode[];
	toString(): string;
}

function parseRoot(input: string): AstNode[] {
	// `astSync` lanza una excepción si el selector es sintácticamente inválido.
	const root = selectorParser().astSync(input);
	return (root as unknown as { nodes: AstNode[] }).nodes;
}

/** Serializa un selector (lista de nodos) en su forma canónica. */
function serializeSelector(selector: AstNode): string {
	const parts: string[] = [];
	for (const node of selector.nodes ?? []) {
		if (node.type === 'comment') continue;
		if (node.type === 'combinator') {
			// El combinador descendiente tiene valor ' '; el resto se rodea de
			// un único espacio para normalizar `div>h1` y `div > h1`.
			parts.push(node.value === ' ' ? ' ' : ` ${node.value ?? ''} `);
			continue;
		}
		parts.push(serializeCompound(node));
	}
	return parts.join('').trim();
}

/** Serializa un selector compuesto (una unidad sin combinadores). */
function serializeCompound(node: AstNode): string {
	switch (node.type) {
		case 'tag':
			return node.value ?? '';
		case 'universal':
			return '*';
		case 'id':
			return `#${node.value ?? ''}`;
		case 'class':
			return `.${node.value ?? ''}`;
		case 'nesting':
			return '&';
		case 'string':
			return `${node.quoteMark ?? ''}${node.value ?? ''}${node.quoteMark ?? ''}`;
		case 'pseudo': {
			const name = node.value ?? '';
			if (node.nodes && node.nodes.length > 0) {
				return `${name}(${node.nodes.map(serializeSelector).join(',')})`;
			}
			return name;
		}
		case 'attribute': {
			const attr = node.attribute ?? '';
			if (!node.operator) return `[${attr}]`;
			const rawValue = node.raws?.value ?? `"${node.value ?? ''}"`;
			const insensitive = node.insensitive ? ' i' : '';
			return `[${attr}${node.operator}${rawValue}${insensitive}]`;
		}
		default:
			return node.value ?? '';
	}
}

/** Comprueba que cada selector dentro de una pseudoclase funcional no esté vacío. */
function pseudoArgsValid(node: AstNode): boolean {
	for (const inner of node.nodes ?? []) {
		if (inner.type !== 'selector') continue;
		const innerNodes = inner.nodes ?? [];
		if (!innerNodes.some((child) => child.type !== 'comment')) return false;
		for (const child of innerNodes) {
			if (child.type === 'pseudo' && child.nodes && !pseudoArgsValid(child)) return false;
		}
	}
	return true;
}

/** Comprueba la estructura sintáctica básica de un selector individual. */
function isStructurallyValid(selector: AstNode): boolean {
	const nodes = (selector.nodes ?? []).filter((node) => node.type !== 'comment');
	if (nodes.length === 0) return false;
	if (nodes[0]!.type === 'combinator') return false;
	if (nodes[nodes.length - 1]!.type === 'combinator') return false;
	for (let i = 1; i < nodes.length; i += 1) {
		if (nodes[i]!.type === 'combinator' && nodes[i - 1]!.type === 'combinator') return false;
	}

	// Las pseudoclases funcionales (`:is(...)`, `:not(...)`…) deben tener
	// argumentos no vacíos. Las no funcionales (`:hover`) tienen `nodes: []`.
	for (const node of nodes) {
		if (node.type === 'pseudo' && node.nodes && !pseudoArgsValid(node)) return false;
	}
	return true;
}

/**
 * Divide una lista de selectores en unidades individuales respetando las comas
 * internas de las pseudoclases funcionales.
 *
 * `h1, h2, :is(h3, h4)` produce tres selectores: `h1`, `h2` y `:is(h3, h4)`.
 */
export function splitSelectors(input: string): SelectorParseResult {
	const trimmed = input.trim();
	if (!trimmed) return { ok: false, reason: 'empty' };

	let nodes: AstNode[];
	try {
		nodes = parseRoot(trimmed);
	} catch {
		return { ok: false, reason: 'invalid_selector' };
	}

	const selectors: ParsedSelector[] = [];
	for (const node of nodes) {
		if (node.type !== 'selector') continue;
		if (!isStructurallyValid(node)) return { ok: false, reason: 'invalid_selector' };
		selectors.push({ raw: node.toString().trim(), canonical: serializeSelector(node) });
	}

	if (selectors.length === 0) return { ok: false, reason: 'invalid_selector' };
	return { ok: true, selectors };
}

/**
 * Forma canónica de una lista de selectores: cada selector individual
 * canonicalizado y unido por `,`. Devuelve `null` si la entrada no es válida.
 */
export function canonicalizeSelectorList(input: string): string | null {
	const result = splitSelectors(input);
	if (!result.ok) return null;
	return result.selectors.map((selector) => selector.canonical).join(',');
}

/** Comprueba si dos textos de selector son equivalentes salvo formato. */
export function selectorsEqual(a: string, b: string): boolean {
	const ca = canonicalizeSelectorList(a);
	if (ca === null) return false;
	return ca === canonicalizeSelectorList(b);
}
