import { describe, it, expect } from 'vitest';
import { createOcaGameSchema, ocaGameNameSchema } from '@/lib/validation';

/**
 * Validación del alta de partidas de La Oca. Comprueba las reglas que el
 * servidor aplica antes de tocar la base de datos: nombre obligatorio (recortado
 * y acotado) y al menos un grupo participante con formato UUID.
 */

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('createOcaGameSchema', () => {
	it('acepta un nombre y grupos válidos', () => {
		const result = createOcaGameSchema.safeParse({ name: 'Jornada 1', groupIds: [UUID_A] });
		expect(result.success).toBe(true);
	});

	it('recorta el nombre', () => {
		expect(ocaGameNameSchema.parse('  Sala de la calavera  ')).toBe('Sala de la calavera');
	});

	it('rechaza un nombre vacío o solo con espacios', () => {
		expect(ocaGameNameSchema.safeParse('').success).toBe(false);
		expect(ocaGameNameSchema.safeParse('   ').success).toBe(false);
		expect(createOcaGameSchema.safeParse({ name: '   ', groupIds: [UUID_A] }).success).toBe(false);
	});

	it('rechaza un nombre demasiado largo', () => {
		expect(ocaGameNameSchema.safeParse('x'.repeat(81)).success).toBe(false);
	});

	it('rechaza una partida sin grupos participantes', () => {
		expect(createOcaGameSchema.safeParse({ name: 'Partida', groupIds: [] }).success).toBe(false);
	});

	it('rechaza identificadores de grupo que no son UUID', () => {
		expect(createOcaGameSchema.safeParse({ name: 'Partida', groupIds: ['no-es-uuid'] }).success).toBe(
			false,
		);
	});

	it('acepta varios grupos', () => {
		const result = createOcaGameSchema.safeParse({ name: 'Partida', groupIds: [UUID_A, UUID_B] });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.groupIds).toHaveLength(2);
	});
});
