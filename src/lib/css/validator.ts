import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { canonicalizeSelectorList } from '@/lib/css/selector';

/**
 * Validador CSS de la competición.
 *
 * Analiza con PostCSS (nunca con expresiones regulares) el fragmento que envía
 * el grupo para un selector autorizado, aplica límites de tamaño y devuelve
 * únicamente las declaraciones en forma canónica. La puntuación contra las
 * reglas privadas ocurre después, en una función SQL transaccional.
 *
 * Semántica de comparación de selectores:
 *  - La comparación se hace sobre la forma canónica del selector (ver
 *    `@/lib/css/selector`), de modo que las diferencias de formato irrelevantes
 *    (espacios, comentarios, `div>h1` frente a `div > h1`) no afectan, mientras
 *    que un selector distinto o una lista adicional sí se rechazan.
 *
 * Semántica de comparación de valores ("formato irrelevante" vs "valores
 * distintos"):
 *  - Se ignoran los espacios y las mayúsculas de palabras y nombres de
 *    funciones CSS (los identificadores "sin comillas" no distinguen caja).
 *  - Las cadenas entre comillas se conservan tal cual (incluidos espacios).
 *  - Los números no se reescriben: `1.0` no equivale a `1`, y `#fff` no
 *    equivale a `#ffffff`.
 *  - `!important` forma parte del valor: `red` no equivale a `red !important`.
 */

export interface SubmissionLimits {
	maxCssChars: number;
	maxDeclarations: number;
	maxValueChars: number;
}

export const DEFAULT_LIMITS: SubmissionLimits = {
	maxCssChars: 4000,
	maxDeclarations: 20,
	maxValueChars: 500,
};

export type RejectionReason =
	| 'invalid_css'
	| 'empty'
	| 'extra_rules'
	| 'wrong_selector'
	| 'unexpected_structure'
	| 'duplicate_property'
	| 'too_large';

export interface ValidSubmission {
	ok: true;
	declarations: Array<{ property: string; value: string }>;
}

export interface InvalidSubmission {
	ok: false;
	reason: RejectionReason;
}

export type SubmissionResult = ValidSubmission | InvalidSubmission;

function canonicalNodes(nodes: valueParser.Node[]): string {
	const parts: string[] = [];
	for (const node of nodes) {
		if (node.type === 'comment') continue;
		if (node.type === 'space') {
			// Se colapsan los espacios consecutivos en uno solo.
			if (parts.length > 0 && parts[parts.length - 1] !== ' ') parts.push(' ');
			continue;
		}
		parts.push(canonicalNode(node));
	}
	// Sin espacios sobrantes al final.
	while (parts.length > 0 && parts[parts.length - 1] === ' ') parts.pop();
	return parts.join('');
}

function canonicalNode(node: valueParser.Node): string {
	switch (node.type) {
		case 'word':
			// Palabras clave, unidades y colores hex: CSS no distingue caja.
			return node.value.toLowerCase();
		case 'string':
			// Las cadenas se conservan exactas (espacios y caja incluidos).
			return `${node.quote}${node.value}${node.quote}`;
		case 'function':
			return `${node.value.toLowerCase()}(${canonicalNodes(node.nodes)})`;
		default:
			// div (separadores como `,` o `/`), unicode-range, etc.: se
			// conservan tal cual, descartando solo el espaciado que los rodea.
			return node.value;
	}
}

/**
 * Forma canónica de un valor CSS: conserva toda la información semántica
 * (números, unidades, separadores) y normaliza solo el formato irrelevante
 * (espacios, comentarios y caja de palabras/funciones). No convierte valores
 * distintos en equivalentes: `1.0` ≠ `1`, `#fff` ≠ `#ffffff`, `red` ≠
 * `red !important`.
 */
export function canonicalizeValue(value: string): string {
	return canonicalNodes(valueParser(value).nodes);
}

export function validateSelectorSubmission(
	css: string,
	authorizedSelector: string,
	limits: SubmissionLimits = DEFAULT_LIMITS,
): SubmissionResult {
	const trimmed = css.trim();
	if (!trimmed) return { ok: false, reason: 'empty' };
	if (trimmed.length > limits.maxCssChars) return { ok: false, reason: 'too_large' };

	let root: postcss.Root;
	try {
		root = postcss.parse(trimmed);
	} catch {
		return { ok: false, reason: 'invalid_css' };
	}

	for (const node of root.nodes) {
		if (node.type === 'atrule') {
			// @media, @keyframes, @supports, ... no están permitidos.
			return { ok: false, reason: 'unexpected_structure' };
		}
	}

	const rules = root.nodes.filter((node): node is postcss.Rule => node.type === 'rule');
	if (rules.length === 0) return { ok: false, reason: 'invalid_css' };
	if (rules.length > 1) return { ok: false, reason: 'extra_rules' };

	const rule = rules[0]!;
	const submittedSelector = canonicalizeSelectorList(rule.selector);
	const authorizedCanonical = canonicalizeSelectorList(authorizedSelector);
	if (
		submittedSelector === null ||
		authorizedCanonical === null ||
		submittedSelector !== authorizedCanonical
	) {
		return { ok: false, reason: 'wrong_selector' };
	}

	const declarations: Array<{ property: string; value: string }> = [];
	const seen = new Set<string>();

	for (const child of rule.nodes) {
		if (child.type === 'comment') continue;
		if (child.type === 'decl') {
			const property = child.prop.trim().toLowerCase();
			const rawValue = child.value.trim();
			if (!property || !rawValue) {
				return { ok: false, reason: 'unexpected_structure' };
			}
			if (seen.has(property)) return { ok: false, reason: 'duplicate_property' };
			seen.add(property);

			const fullValue = child.important ? `${rawValue} !important` : rawValue;
			if (fullValue.length > limits.maxValueChars) {
				return { ok: false, reason: 'too_large' };
			}
			declarations.push({ property, value: canonicalizeValue(fullValue) });
			if (declarations.length > limits.maxDeclarations) {
				return { ok: false, reason: 'too_large' };
			}
		} else {
			// Regla anidada u otra estructura inesperada dentro del bloque.
			return { ok: false, reason: 'unexpected_structure' };
		}
	}

	if (declarations.length === 0) return { ok: false, reason: 'empty' };
	return { ok: true, declarations };
}