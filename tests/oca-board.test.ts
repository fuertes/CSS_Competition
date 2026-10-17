import { describe, it, expect } from 'vitest';
import {
	OCA_BOARD,
	OCA_BOARD_SQUARES,
	OCA_BOARD_SIZE,
	OCA_BOARD_VERSION,
	OCA_BOARD_ZONES,
	OCA_INITIAL_POSITION,
	OCA_ZONE_DISTRIBUTION_APPROVED,
	getOcaBoardSquare,
	getOcaBoardZone,
	isValidOcaBoardNumber,
	ocaZoneHasSquares,
} from '@/lib/oca/board';

/**
 * Definición del tablero de La Oca del Caos (Fase 3).
 *
 * Comprueba que el tablero tiene exactamente 40 casillas numeradas del 1 al 40,
 * que la definición es determinista, que NO se ha inventado ninguna distribución
 * de zonas y que no existen tipos de casilla ni efectos (no aprobados).
 */

describe('tablero — tamaño y numeración', () => {
	it('tiene exactamente 40 casillas', () => {
		expect(OCA_BOARD_SIZE).toBe(40);
		expect(OCA_BOARD.squares).toHaveLength(40);
		expect(OCA_BOARD_SQUARES).toHaveLength(40);
	});

	it('numera las casillas de forma única y consecutiva del 1 al 40', () => {
		const numbers = OCA_BOARD_SQUARES.map((square) => square.number);
		expect(numbers).toEqual(Array.from({ length: 40 }, (_, index) => index + 1));
		expect(new Set(numbers).size).toBe(40);
	});

	it('da a cada casilla un identificador único y estable', () => {
		const ids = OCA_BOARD_SQUARES.map((square) => square.id);
		expect(new Set(ids).size).toBe(40);
		expect(OCA_BOARD_SQUARES[0]?.id).toBe('casilla-01');
		expect(OCA_BOARD_SQUARES[39]?.id).toBe('casilla-40');
	});

	it('es determinista: la definición no cambia entre lecturas', () => {
		expect(OCA_BOARD.squares).toBe(OCA_BOARD_SQUARES);
		expect(JSON.stringify(OCA_BOARD)).toBe(JSON.stringify(OCA_BOARD));
		expect(OCA_BOARD.version).toBe(OCA_BOARD_VERSION);
		expect(OCA_BOARD.size).toBe(OCA_BOARD_SIZE);
	});
});

describe('tablero — zonas y casillas especiales', () => {
	it('define las seis zonas temáticas previstas', () => {
		expect(OCA_BOARD_ZONES).toHaveLength(6);
		expect(OCA_BOARD_ZONES.map((zone) => zone.name)).toEqual([
			'Criptas del Layout',
			'Puentes Flexbox',
			'Laberinto Grid',
			'Minas Responsive',
			'Santuario UX',
			'Ciudadela Final',
		]);
		expect(OCA_BOARD_ZONES.map((zone) => zone.order)).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it('deja EXPLÍCITAMENTE pendiente la asignación de zonas (no se inventa)', () => {
		expect(OCA_ZONE_DISTRIBUTION_APPROVED).toBe(false);
		for (const square of OCA_BOARD_SQUARES) {
			expect(square.zoneId).toBeNull();
		}
		for (const zone of OCA_BOARD_ZONES) {
			expect(ocaZoneHasSquares(zone.id)).toBe(false);
		}
	});

	it('no define tipos de casilla ni efectos (requieren especificación aprobada)', () => {
		for (const square of OCA_BOARD_SQUARES) {
			expect(Object.keys(square).sort()).toEqual(['id', 'number', 'zoneId']);
		}
	});
});

describe('tablero — utilidades', () => {
	it('considera válidos solo los números del 1 al 40', () => {
		expect(isValidOcaBoardNumber(1)).toBe(true);
		expect(isValidOcaBoardNumber(40)).toBe(true);
		for (const invalid of [0, 41, -1, 1.5, NaN, Infinity, '1', null, undefined, {}]) {
			expect(isValidOcaBoardNumber(invalid)).toBe(false);
		}
	});

	it('obtiene una casilla por su número y rechaza números inválidos', () => {
		expect(getOcaBoardSquare(1)?.id).toBe('casilla-01');
		expect(getOcaBoardSquare(40)?.number).toBe(40);
		expect(getOcaBoardSquare(0)).toBeUndefined();
		expect(getOcaBoardSquare(41)).toBeUndefined();
	});

	it('obtiene una zona por su identificador', () => {
		expect(getOcaBoardZone('ciudadela-final')?.name).toBe('Ciudadela Final');
		expect(getOcaBoardZone('no-existe')).toBeUndefined();
	});

	it('la posición inicial es la casilla 1', () => {
		expect(OCA_INITIAL_POSITION).toBe(1);
		expect(isValidOcaBoardNumber(OCA_INITIAL_POSITION)).toBe(true);
	});
});
