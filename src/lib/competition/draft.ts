import type { SelectorStatus } from '@/types';

/**
 * Estado local de la navegación entre selectores (solo navegador).
 *
 * El borrador del editor y el selector activo se guardan por ejercicio y
 * selector. Esto es únicamente una comodidad de edición: guardar un borrador
 * NUNCA otorga puntos ni cuenta como entrega válida. La puntuación solo cambia
 * cuando el servidor evalúa una entrega.
 *
 * El módulo es agnóstico del almacenamiento (`DraftStorage`) para poder probar
 * la lógica de conservación de borradores con un almacén en memoria.
 */

export interface DraftStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** Plantilla inicial de un selector para empezar a escribir. */
export function skeleton(selector: string): string {
	return `${selector} {\n  \n}`;
}

/** Clave del borrador de un selector concreto dentro de un ejercicio. */
export function draftKey(exerciseId: string, selectorId: string): string {
	return `css.draft.${exerciseId}.${selectorId}`;
}

/** Clave del selector activo de un ejercicio. */
export function activeKey(exerciseId: string): string {
	return `css.active.${exerciseId}`;
}

/**
 * Elige el selector activo: se respeta la preferencia si sigue siendo válida
 * (al volver a un selector anterior o al recargar); si no, el primero que no
 * esté completado; y como último recurso el primero disponible.
 */
export function resolveActiveSelector(
	selectors: ReadonlyArray<{ id: string; status: SelectorStatus }>,
	preferredId: string | null | undefined,
): string | null {
	if (preferredId && selectors.some((item) => item.id === preferredId)) {
		return preferredId;
	}
	const incomplete = selectors.find((item) => item.status !== 'completed');
	if (incomplete) return incomplete.id;
	return selectors[0]?.id ?? null;
}

export interface DraftStore {
	getDraft(exerciseId: string, selectorId: string): string | null;
	setDraft(exerciseId: string, selectorId: string, value: string): void;
	getActive(exerciseId: string): string | null;
	setActive(exerciseId: string, selectorId: string): void;
}

/** Crea el almacén de borradores sobre una implementación de `DraftStorage`. */
export function createDraftStore(storage: DraftStorage): DraftStore {
	return {
		getDraft(exerciseId, selectorId) {
			return storage.getItem(draftKey(exerciseId, selectorId));
		},
		setDraft(exerciseId, selectorId, value) {
			storage.setItem(draftKey(exerciseId, selectorId), value);
		},
		getActive(exerciseId) {
			return storage.getItem(activeKey(exerciseId));
		},
		setActive(exerciseId, selectorId) {
			storage.setItem(activeKey(exerciseId), selectorId);
		},
	};
}

const fallbackMemory = new Map<string, string>();

/**
 * Almacenamiento del navegador tolerante a fallos (modo privado, cuota). Si
 * `localStorage` no está disponible o falla, usa memoria de la sesión.
 */
export function browserDraftStorage(): DraftStorage {
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			const ls = window.localStorage;
			// Comprueba que se puede escribir antes de confiar en él.
			const probe = '__css_probe__';
			ls.setItem(probe, '1');
			ls.setItem(probe, '0');
			return {
				getItem(key) {
					try {
						return ls.getItem(key);
					} catch {
						return fallbackMemory.get(key) ?? null;
					}
				},
				setItem(key, value) {
					try {
						ls.setItem(key, value);
					} catch {
						fallbackMemory.set(key, value);
					}
				},
			};
		}
	} catch {
		// Ignorado: se usa el almacén en memoria.
	}
	return {
		getItem: (key) => fallbackMemory.get(key) ?? null,
		setItem: (key, value) => {
			fallbackMemory.set(key, value);
		},
	};
}

/** Etiquetas legibles del estado de un selector (nunca revelan propiedades). */
export const SELECTOR_STATUS_LABELS: Record<SelectorStatus, string> = {
	pending: 'Pendiente',
	in_progress: 'En progreso',
	completed: 'Completado',
};
