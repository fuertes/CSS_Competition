import postcss from 'postcss';
import { canonicalizeValue } from '@/lib/css/validator';
import { splitSelectors } from '@/lib/css/selector';

/**
 * Importador de CSS de referencia.
 *
 * Analiza en el servidor (PostCSS, nunca expresiones regulares) un bloque CSS
 * completo pegado por el profesor y lo transforma en la estructura del modelo
 * de ejercicios: selectores individuales con sus declaraciones y valores
 * esperados.
 *
 * Este módulo NO toca la base de datos: solo produce/valida la estructura de
 * importación. El guardado transaccional vive en la capa de datos.
 *
 * Separación de conceptos: este CSS es el *CSS de referencia* (define las
 * soluciones privadas). No se usa como CSS inicial del alumno ni se genera a
 * partir de él un CSS defectuoso de forma automática.
 */

export interface ImportLimits {
	maxCssChars: number;
	maxSelectors: number;
	maxDeclarationsTotal: number;
	maxDeclarationsPerSelector: number;
	maxValueChars: number;
}

export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
	maxCssChars: 20000,
	maxSelectors: 100,
	maxDeclarationsTotal: 1000,
	maxDeclarationsPerSelector: 50,
	maxValueChars: 500,
};

export interface ImportDeclaration {
	/** Propiedad en minúsculas (p. ej. `background-color`). */
	name: string;
	/** Valor esperado tal cual se escribió (incluye `!important` si lo había). */
	expectedValue: string;
}

export interface ImportSelector {
	/** Selector original (recortado) para mostrar al profesor. */
	selector: string;
	/** Forma canónica usada para detectar selectores repetidos. */
	canonical: string;
	declarations: ImportDeclaration[];
}

export interface ImportStats {
	selectorCount: number;
	declarationCount: number;
}

export interface ImportResult {
	ok: boolean;
	selectors: ImportSelector[];
	warnings: string[];
	errors: string[];
	stats: ImportStats;
}

function emptyStats(): ImportStats {
	return { selectorCount: 0, declarationCount: 0 };
}

function blankResult(errors: string[], warnings: string[] = []): ImportResult {
	return { ok: false, selectors: [], warnings, errors, stats: emptyStats() };
}

/**
 * Analiza un bloque CSS completo. Devuelve selectores individuales (las listas
 * agrupadas se dividen) con sus declaraciones, además de advertencias y errores.
 *
 * Políticas:
 *  - Un selector repetido (misma forma canónica) se fusiona; se avisa.
 *  - Una declaración duplicada dentro de un selector conserva el último valor;
 *    se avisa.
 *  - Un selector sin declaraciones se omite con una advertencia.
 *  - Las construcciones no representables por el modelo (`@media`, `@supports`,
 *    `@keyframes`, reglas anidadas…) producen un error explícito.
 */
export function analyzeCss(
	source: string,
	limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): ImportResult {
	const trimmed = source.trim();
	if (!trimmed) return blankResult(['Pega un bloque CSS para analizarlo.']);
	if (trimmed.length > limits.maxCssChars) {
		return blankResult([`El CSS supera el límite de ${limits.maxCssChars} caracteres.`]);
	}

	let root: postcss.Root;
	try {
		root = postcss.parse(trimmed);
	} catch (error) {
		const detail = error instanceof Error ? error.message : 'sintaxis no válida';
		return blankResult([`No se pudo analizar el CSS: ${detail}.`]);
	}

	const warnings: string[] = [];
	const errors: string[] = [];
	const selectors: ImportSelector[] = [];
	const byCanonical = new Map<string, ImportSelector>();

	for (const node of root.nodes) {
		if (node.type === 'comment') continue;

		if (node.type === 'atrule') {
			errors.push(
				`La regla @${node.name} no es compatible: solo se admiten reglas CSS simples con declaraciones directas.`,
			);
			continue;
		}

		if (node.type !== 'rule') {
			errors.push('Se encontró contenido que no es una regla CSS válida.');
			continue;
		}

		const parsedSelectors = splitSelectors(node.selector);
		if (!parsedSelectors.ok) {
			errors.push(
				`El selector "${node.selector.trim()}" no es válido${
					parsedSelectors.reason === 'empty' ? ' (está vacío)' : ''
				}.`,
			);
			continue;
		}

		// Declaraciones del bloque (por propiedad; el último valor gana).
		const declarations: ImportDeclaration[] = [];
		const indexByProperty = new Map<string, number>();
		let blockError = false;

		for (const child of node.nodes) {
			if (child.type === 'comment') continue;
			if (child.type === 'atrule') {
				errors.push(
					`La regla @${child.name} dentro de un selector no es compatible.`,
				);
				blockError = true;
				continue;
			}
			if (child.type !== 'decl') {
				errors.push('Se encontró una regla anidada no compatible dentro de un selector.');
				blockError = true;
				continue;
			}

			const name = child.prop.trim().toLowerCase();
			const baseValue = child.value.trim();
			if (!name || !baseValue) {
				errors.push(`Hay una declaración sin propiedad o sin valor en "${node.selector.trim()}".`);
				blockError = true;
				continue;
			}

			const expectedValue = child.important ? `${baseValue} !important` : baseValue;
			if (expectedValue.length > limits.maxValueChars) {
				errors.push(
					`El valor de "${name}" supera el límite de ${limits.maxValueChars} caracteres.`,
				);
				blockError = true;
				continue;
			}

			const existing = indexByProperty.get(name);
			if (existing !== undefined) {
				warnings.push(
					`La propiedad "${name}" está duplicada en "${node.selector.trim()}"; se conserva el último valor.`,
				);
				declarations[existing] = { name, expectedValue };
			} else {
				indexByProperty.set(name, declarations.length);
				declarations.push({ name, expectedValue });
			}

			if (declarations.length > limits.maxDeclarationsPerSelector) {
				errors.push(
					`Un selector no puede tener más de ${limits.maxDeclarationsPerSelector} declaraciones.`,
				);
				blockError = true;
				break;
			}
		}

		if (blockError) continue;

		if (declarations.length === 0) {
			warnings.push(`El selector "${node.selector.trim()}" no tiene declaraciones; se omite.`);
			continue;
		}

		// Cada selector de una lista agrupada se convierte en una unidad. Si el
		// mismo selector (forma canónica) aparece en varios sitios, se fusiona.
		for (const parsed of parsedSelectors.selectors) {
			const existing = byCanonical.get(parsed.canonical);
			if (existing) {
				warnings.push(
					`El selector "${parsed.raw}" está repetido; sus declaraciones se fusionan en una sola unidad.`,
				);
				mergeDeclarations(existing, declarations, warnings);
				continue;
			}
			const unit: ImportSelector = {
				selector: parsed.raw,
				canonical: parsed.canonical,
				declarations: declarations.map((declaration) => ({ ...declaration })),
			};
			byCanonical.set(parsed.canonical, unit);
			selectors.push(unit);
		}
	}

	if (selectors.length > limits.maxSelectors) {
		errors.push(`La importación supera el límite de ${limits.maxSelectors} selectores.`);
	}

	const declarationCount = selectors.reduce((total, item) => total + item.declarations.length, 0);
	if (declarationCount > limits.maxDeclarationsTotal) {
		errors.push(
			`La importación supera el límite de ${limits.maxDeclarationsTotal} declaraciones.`,
		);
	}

	if (errors.length === 0 && selectors.length === 0) {
		errors.push('No se detectó ningún selector con declaraciones.');
	}

	return {
		ok: errors.length === 0,
		selectors,
		warnings,
		errors,
		stats: { selectorCount: selectors.length, declarationCount },
	};
}

/** Fusiona declaraciones dentro de un selector repetido (el último valor gana). */
function mergeDeclarations(
	target: ImportSelector,
	incoming: ImportDeclaration[],
	warnings: string[],
): void {
	const indexByProperty = new Map<string, number>();
	target.declarations.forEach((declaration, index) => {
		indexByProperty.set(declaration.name, index);
	});
	for (const declaration of incoming) {
		const existing = indexByProperty.get(declaration.name);
		if (existing !== undefined) {
			if (target.declarations[existing]!.expectedValue !== declaration.expectedValue) {
				warnings.push(
					`La propiedad "${declaration.name}" tiene valores distintos en selectores repetidos; se conserva el último.`,
				);
			}
			target.declarations[existing] = { ...declaration };
		} else {
			indexByProperty.set(declaration.name, target.declarations.length);
			target.declarations.push({ ...declaration });
		}
	}
}

/* ---------------------------------------------------------------------------
 * Revalidación en el servidor de la estructura revisada por el profesor.
 *
 * El navegador es no confiable: nunca se guarda el JSON del cliente tal cual.
 * Se vuelve a validar cada selector y se recalcula el valor canónico de cada
 * declaración antes de escribir en la base de datos.
 * ------------------------------------------------------------------------- */

export interface NormalizedRule {
	property: string;
	expectedCanonical: string;
	points: number;
}

export interface NormalizedSelector {
	selector: string;
	canonical: string;
	rules: NormalizedRule[];
}

export type ImportPayloadValidation =
	| { ok: true; selectors: NormalizedSelector[] }
	| { ok: false; message: string };

const PROPERTY_PATTERN = /^(--[A-Za-z0-9_-]+|-?[A-Za-z][A-Za-z0-9-]*)$/;

export interface RawImportSelector {
	selector: string;
	declarations: Array<{ name: string; expectedValue: string; points?: number }>;
}

export function validateImportPayload(
	selectors: RawImportSelector[],
	basePoints: number,
	limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): ImportPayloadValidation {
	if (selectors.length === 0) return { ok: false, message: 'Añade al menos un selector.' };
	if (selectors.length > limits.maxSelectors) {
		return { ok: false, message: `No se permiten más de ${limits.maxSelectors} selectores.` };
	}

	const normalized: NormalizedSelector[] = [];
	const seenCanonical = new Set<string>();
	let totalDeclarations = 0;

	for (const item of selectors) {
		const parsed = splitSelectors(item.selector);
		if (!parsed.ok) {
			return { ok: false, message: `El selector "${item.selector}" no es válido.` };
		}
		if (parsed.selectors.length !== 1) {
			return {
				ok: false,
				message: `El selector "${item.selector}" debe ser un único selector (se corrige uno cada vez).`,
			};
		}
		const unit = parsed.selectors[0]!;
		if (seenCanonical.has(unit.canonical)) {
			return { ok: false, message: `El selector "${unit.raw}" está repetido.` };
		}
		seenCanonical.add(unit.canonical);

		if (item.declarations.length === 0) {
			return { ok: false, message: `El selector "${unit.raw}" no tiene propiedades.` };
		}
		if (item.declarations.length > limits.maxDeclarationsPerSelector) {
			return {
				ok: false,
				message: `El selector "${unit.raw}" supera el máximo de ${limits.maxDeclarationsPerSelector} propiedades.`,
			};
		}

		const rules: NormalizedRule[] = [];
		const seenProperty = new Set<string>();

		for (const declaration of item.declarations) {
			const property = declaration.name.trim().toLowerCase();
			const expectedValue = declaration.expectedValue.trim();
			if (!PROPERTY_PATTERN.test(property)) {
				return { ok: false, message: `La propiedad "${declaration.name}" no es válida.` };
			}
			if (!expectedValue) {
				return { ok: false, message: `La propiedad "${property}" no tiene valor esperado.` };
			}
			if (expectedValue.length > limits.maxValueChars) {
				return {
					ok: false,
					message: `El valor de "${property}" supera el límite de ${limits.maxValueChars} caracteres.`,
				};
			}
			const expectedCanonical = canonicalizeValue(expectedValue);
			if (!expectedCanonical) {
				return { ok: false, message: `El valor de "${property}" no es válido.` };
			}
			// Declaraciones duplicadas: se conserva el último valor.
			if (seenProperty.has(property)) {
				const previous = rules.findIndex((rule) => rule.property === property);
				if (previous >= 0) rules.splice(previous, 1);
			}
			seenProperty.add(property);

			const points =
				typeof declaration.points === 'number' && Number.isFinite(declaration.points)
					? Math.trunc(declaration.points)
					: basePoints;
			if (points < 1 || points > 1000) {
				return { ok: false, message: `Los puntos de "${property}" deben estar entre 1 y 1000.` };
			}

			rules.push({ property, expectedCanonical, points });
			totalDeclarations += 1;
		}

		normalized.push({ selector: unit.raw, canonical: unit.canonical, rules });
	}

	if (totalDeclarations > limits.maxDeclarationsTotal) {
		return {
			ok: false,
			message: `La importación supera el límite de ${limits.maxDeclarationsTotal} declaraciones.`,
		};
	}

	return { ok: true, selectors: normalized };
}
