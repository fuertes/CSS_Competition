/**
 * Definición del tablero de «Dungeon Coder: La Oca del Caos» (Fase 3).
 *
 * Configuración CENTRALIZADA, TIPADA e INMUTABLE del tablero. Es lógica pura y
 * determinista: no depende de la base de datos, de la sesión, de la hora ni de
 * ningún estado mutable, así que la identidad y el número de cada casilla son
 * estables entre peticiones y reinicios del servidor.
 *
 * Alcance de esta fase (y límites deliberados):
 *   * El tablero tiene EXACTAMENTE 40 casillas numeradas del 1 al 40.
 *   * Se define el catálogo de las seis zonas temáticas previstas.
 *   * NO existe un documento funcional aprobado que fije qué casillas forman
 *     cada zona (la auditoría de integración lo deja como pregunta abierta).
 *     Por eso la asignación casilla → zona queda EXPLÍCITAMENTE PENDIENTE y
 *     todas las casillas tienen `zoneId = null`. No se inventa ninguna
 *     distribución, ni casillas especiales, ni trampas, ni recompensas, ni
 *     efectos.
 *   * NO se define "tipo de casilla": esa noción solo debe existir si hay una
 *     especificación funcional aprobada, que hoy no está disponible.
 *
 * El tablero es una constante de código (no una tabla por casilla): es
 * suficiente para las necesidades actuales, evita 40 filas de configuración
 * duplicada por partida y mantiene la definición en un único lugar reutilizado
 * por páginas, componentes y pruebas. La única persistencia de la Fase 3 es la
 * POSICIÓN de cada participante (columna `oca_game_participants.position`).
 */

/** Número total de casillas del tablero. */
export const OCA_BOARD_SIZE = 40;

/**
 * Versión de la definición del tablero. Permite evolucionar el diseño sin
 * perder compatibilidad: una futura distribución de zonas aprobada incrementará
 * esta versión y podrá guardarse junto a las partidas.
 */
export const OCA_BOARD_VERSION = 1;

/** Casilla inicial de todos los participantes (el tablero empieza en la 1). */
export const OCA_INITIAL_POSITION = 1;

/**
 * Identificador estable de cada zona temática. Es un identificador, no un
 * número de casilla: la correspondencia zona ↔ casillas está pendiente.
 */
export type OcaBoardZoneId =
	| 'criptas-layout'
	| 'puentes-flexbox'
	| 'laberinto-grid'
	| 'minas-responsive'
	| 'santuario-ux'
	| 'ciudadela-final';

/** Zona temática prevista del tablero (definición, sin casillas asignadas). */
export interface OcaBoardZone {
	readonly id: OcaBoardZoneId;
	/** Nombre visible y estable de la zona. */
	readonly name: string;
	/** Orden de presentación (1-based), para leyendas estables. */
	readonly order: number;
	/** Color de apoyo visual. Nunca es el único modo de identificar la zona. */
	readonly color: string;
}

/**
 * Casilla del tablero. La identidad (`id`) y el `number` son estables y únicos.
 */
export interface OcaBoardSquare {
	/** Identificador estable, independiente de la posición en pantalla. */
	readonly id: string;
	/** Número de casilla, del 1 al 40. */
	readonly number: number;
	/**
	 * Zona de la casilla. Es `null` MIENTRAS la asignación definitiva esté
	 * pendiente de aprobación; no se rellena con valores inventados.
	 */
	readonly zoneId: OcaBoardZoneId | null;
}

/** Definición completa y versionada del tablero. */
export interface OcaBoardDefinition {
	readonly version: number;
	readonly size: number;
	readonly zones: readonly OcaBoardZone[];
	readonly squares: readonly OcaBoardSquare[];
}

/** Catálogo de las seis zonas temáticas previstas. */
export const OCA_BOARD_ZONES: readonly OcaBoardZone[] = [
	{ id: 'criptas-layout', name: 'Criptas del Layout', order: 1, color: '#6366f1' },
	{ id: 'puentes-flexbox', name: 'Puentes Flexbox', order: 2, color: '#22d3ee' },
	{ id: 'laberinto-grid', name: 'Laberinto Grid', order: 3, color: '#a855f7' },
	{ id: 'minas-responsive', name: 'Minas Responsive', order: 4, color: '#f59e0b' },
	{ id: 'santuario-ux', name: 'Santuario UX', order: 5, color: '#10b981' },
	{ id: 'ciudadela-final', name: 'Ciudadela Final', order: 6, color: '#f43f5e' },
];

/**
 * La distribución de casillas por zona todavía NO está aprobada. Las vistas
 * deben mostrar esta limitación en lugar de presentar zonas como si estuvieran
 * definidas.
 */
export const OCA_ZONE_DISTRIBUTION_APPROVED = false;

/** Mensaje único sobre el estado pendiente de la distribución de zonas. */
export const OCA_ZONE_DISTRIBUTION_NOTE =
	'La distribución de las casillas entre las zonas temáticas está pendiente de aprobación: de momento el tablero muestra las 40 casillas numeradas sin asignarlas a ninguna zona.';

/** Construye las 40 casillas de forma determinista (1..40, sin zonas). */
function buildOcaBoardSquares(): OcaBoardSquare[] {
	const squares: OcaBoardSquare[] = [];
	for (let number = 1; number <= OCA_BOARD_SIZE; number += 1) {
		squares.push({
			id: `casilla-${String(number).padStart(2, '0')}`,
			number,
			zoneId: null,
		});
	}
	return squares;
}

/** Las 40 casillas del tablero, numeradas del 1 al 40. */
export const OCA_BOARD_SQUARES: readonly OcaBoardSquare[] = buildOcaBoardSquares();

/** Definición del tablero lista para reutilizar en vistas y pruebas. */
export const OCA_BOARD: OcaBoardDefinition = {
	version: OCA_BOARD_VERSION,
	size: OCA_BOARD_SIZE,
	zones: OCA_BOARD_ZONES,
	squares: OCA_BOARD_SQUARES,
};

/** ¿El valor es un número de casilla válido del tablero (1..40)? */
export function isValidOcaBoardNumber(value: unknown): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 1 &&
		value <= OCA_BOARD_SIZE
	);
}

/** Devuelve la casilla por su número, o `undefined` si no existe. */
export function getOcaBoardSquare(number: number): OcaBoardSquare | undefined {
	if (!isValidOcaBoardNumber(number)) return undefined;
	return OCA_BOARD_SQUARES[number - 1];
}

/** Devuelve la zona por su identificador, o `undefined` si no existe. */
export function getOcaBoardZone(id: string): OcaBoardZone | undefined {
	return OCA_BOARD_ZONES.find((zone) => zone.id === id);
}

/** ¿La zona tiene casillas asignadas en la definición actual? */
export function ocaZoneHasSquares(id: OcaBoardZoneId): boolean {
	return OCA_BOARD_SQUARES.some((square) => square.zoneId === id);
}
