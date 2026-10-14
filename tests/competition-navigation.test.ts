import { describe, it, expect } from 'vitest';
import {
	activeKey,
	createDraftStore,
	draftKey,
	resolveActiveSelector,
	skeleton,
	type DraftStorage,
} from '@/lib/competition/draft';

/** Almacén en memoria que imita `localStorage` para probar la lógica pura. */
function memoryStorage(): DraftStorage {
	const map = new Map<string, string>();
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => {
			map.set(key, value);
		},
	};
}

const SELECTORS = [
	{ id: 'sel-a', status: 'pending' as const },
	{ id: 'sel-b', status: 'in_progress' as const },
	{ id: 'sel-c', status: 'completed' as const },
];

describe('borradores y navegación entre selectores', () => {
	it('conserva el borrador al cambiar de selector y volver al anterior', () => {
		const store = createDraftStore(memoryStorage());
		store.setDraft('ex1', 'sel-a', '.a { color: red }');
		store.setDraft('ex1', 'sel-b', '.b { color: blue }');

		// Cambiar a otro selector no borra el anterior.
		expect(store.getDraft('ex1', 'sel-a')).toBe('.a { color: red }');

		// Volver al selector anterior recupera exactamente lo escrito.
		expect(store.getDraft('ex1', 'sel-b')).toBe('.b { color: blue }');
		expect(store.getDraft('ex1', 'sel-a')).toBe('.a { color: red }');
	});

	it('mantiene el borrador tras una recarga (mismo almacenamiento, nuevo store)', () => {
		const storage = memoryStorage();
		const before = createDraftStore(storage);
		before.setDraft('ex1', 'sel-a', '.a { color: red }');
		before.setActive('ex1', 'sel-a');

		// Simula recargar la página recreando el store sobre el mismo storage.
		const after = createDraftStore(storage);
		expect(after.getDraft('ex1', 'sel-a')).toBe('.a { color: red }');
		expect(after.getActive('ex1')).toBe('sel-a');
	});

	it('aísla los borradores por ejercicio y por selector', () => {
		const store = createDraftStore(memoryStorage());
		store.setDraft('ex1', 'sel-a', 'uno');
		store.setDraft('ex2', 'sel-a', 'dos');
		expect(store.getDraft('ex1', 'sel-a')).toBe('uno');
		expect(store.getDraft('ex2', 'sel-a')).toBe('dos');
		expect(store.getDraft('ex1', 'sel-b')).toBeNull();
		expect(draftKey('ex1', 'sel-a')).not.toBe(draftKey('ex2', 'sel-a'));
		expect(activeKey('ex1')).not.toBe(activeKey('ex2'));
	});
});

describe('resolveActiveSelector', () => {
	it('respeta el selector activo guardado si sigue siendo válido', () => {
		expect(resolveActiveSelector(SELECTORS, 'sel-b')).toBe('sel-b');
		expect(resolveActiveSelector(SELECTORS, 'sel-c')).toBe('sel-c');
	});

	it('ignora una preferencia inválida y elige el primer selector incompleto', () => {
		expect(resolveActiveSelector(SELECTORS, 'sel-inexistente')).toBe('sel-a');
		expect(resolveActiveSelector(SELECTORS, null)).toBe('sel-a');
	});

	it('cuando todos están completos, mantiene la preferencia o usa el primero', () => {
		const done = SELECTORS.map((selector) => ({ ...selector, status: 'completed' as const }));
		expect(resolveActiveSelector(done, 'sel-b')).toBe('sel-b');
		expect(resolveActiveSelector(done, null)).toBe('sel-a');
	});

	it('sin selectores devuelve null', () => {
		expect(resolveActiveSelector([], null)).toBeNull();
	});
});

describe('skeleton', () => {
	it('genera una plantilla pegable con el selector', () => {
		expect(skeleton('.boton')).toBe('.boton {\n  \n}');
	});
});
