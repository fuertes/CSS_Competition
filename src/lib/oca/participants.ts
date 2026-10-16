/**
 * Reglas puras de selección de grupos participantes en una partida de La Oca.
 *
 * Este módulo NO accede a la base de datos ni es exclusivo de servidor: solo
 * contiene normalización de identificadores, de modo que pueda probarse sin
 * dobles y reutilizarse desde el servidor.
 */

/**
 * Normaliza la lista de grupos participantes seleccionada por el profesorado.
 *
 * Elimina duplicados (comparación sin distinguir mayúsculas), descarta cadenas
 * vacías y conserva el orden de la primera aparición. La base de datos impide
 * igualmente la asociación duplicada (clave primaria compuesta); esta
 * normalización evita además errores e intentos redundantes.
 *
 * La frontera de validación (formato UUID con Zod) y la comprobación real de
 * existencia y estado activo de cada grupo se hacen en el servidor.
 */
export function normalizeOcaGroupIds(groupIds: readonly string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const raw of groupIds) {
		const id = raw.trim().toLowerCase();
		if (id === '' || seen.has(id)) continue;
		seen.add(id);
		result.push(id);
	}

	return result;
}
