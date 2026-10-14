import { describe, it, expect } from 'vitest';
import {
	codeSchema,
	submitCodeSchema,
	groupInputSchema,
	studentInputSchema,
	exerciseInputSchema,
	settingsInputSchema,
	correctAssignmentSchema,
	credentialsSchema,
	PURGE_CONFIRMATIONS,
	purgeSchema,
} from '@/lib/validation';

describe('codeSchema', () => {
	it('acepta códigos no vacíos y recorta espacios', () => {
		expect(codeSchema.parse('  activo-42  ')).toBe('activo-42');
	});

	it('rechaza códigos vacíos o solo espacios', () => {
		expect(() => codeSchema.parse('')).toThrow();
		expect(() => codeSchema.parse('   ')).toThrow();
	});

	it('rechaza códigos excesivamente largos', () => {
		expect(() => codeSchema.parse('x'.repeat(65))).toThrow();
	});
});

describe('submitCodeSchema', () => {
	it('requiere acceso de alumno y código de ejercicio', () => {
		expect(submitCodeSchema.parse({ studentCode: ' ABC ', exerciseCode: 'XYZ1' })).toEqual({
			studentCode: 'ABC',
			exerciseCode: 'XYZ1',
		});
	});

	it('rechaza un envío sin el código del alumno', () => {
		expect(() => submitCodeSchema.parse({ exerciseCode: 'XYZ1' })).toThrow();
	});
});

describe('groupInputSchema', () => {
	it('valida nombre y color hexadecimal', () => {
		expect(groupInputSchema.parse({ name: 'Estelares', color: '#f43f5e' })).toMatchObject({
			name: 'Estelares',
			color: '#f43f5e',
			active: true,
		});
	});

	it('rechaza colores no hexadecimales', () => {
		expect(() => groupInputSchema.parse({ name: 'X', color: 'rojo' })).toThrow();
	});
});

describe('studentInputSchema', () => {
	it('normaliza group_id opcional a null', () => {
		expect(studentInputSchema.parse({ name: 'Ada', group_id: null })).toMatchObject({
			name: 'Ada',
			group_id: null,
			active: true,
		});
	});

	it('rechaza group_id que no sea UUID', () => {
		expect(() => studentInputSchema.parse({ name: 'Ada', group_id: 'no-soy-uuid' })).toThrow();
	});
});

describe('exerciseInputSchema', () => {
	it('convierte puntos desde cadena y fija descripción nula', () => {
		expect(
			exerciseInputSchema.parse({ title: 'Lab', points: '100', description: '' }),
		).toMatchObject({ title: 'Lab', points: 100, active: true, archived: false });
	});

	it('rechaza puntos no enteros o fuera de rango', () => {
		expect(() => exerciseInputSchema.parse({ title: 'X', points: 1.5 })).toThrow();
		expect(() => exerciseInputSchema.parse({ title: 'X', points: 0 })).toThrow();
	});
});

describe('settingsInputSchema', () => {
	it('acepta la configuración completa con conversión de números', () => {
		expect(
			settingsInputSchema.parse({
				name: 'Competición',
				default_points: '100',
				assignments_locked_by_default: true,
				allow_admin_assignment_correction: false,
				submission_max_attempts: '5',
				submission_window_seconds: '60',
				css_login_max_attempts: '5',
				css_login_window_seconds: '300',
				css_speed_bonus_points: '0',
				css_speed_bonus_seconds: '120',
				penalty_enabled: true,
				css_points_per_property: '25',
				penalty_points: '5',
				penalty_mode: 'per_property',
				allow_negative_score: true,
			}),
		).toMatchObject({
			name: 'Competición',
			default_points: 100,
			assignments_locked_by_default: true,
			allow_admin_assignment_correction: false,
			submission_max_attempts: 5,
			submission_window_seconds: 60,
			css_login_max_attempts: 5,
			css_login_window_seconds: 300,
			css_speed_bonus_points: 0,
			css_speed_bonus_seconds: 120,
			penalty_enabled: true,
			css_points_per_property: 25,
			penalty_points: 5,
			penalty_mode: 'per_property',
			allow_negative_score: true,
		});
	});

	it('rechaza ventanas de intento demasiado cortas', () => {
		expect(() =>
			settingsInputSchema.parse({
				name: 'X',
				default_points: 100,
				assignments_locked_by_default: true,
				allow_admin_assignment_correction: false,
				submission_max_attempts: 5,
				submission_window_seconds: 5,
				css_login_max_attempts: 5,
				css_login_window_seconds: 300,
				css_speed_bonus_points: 0,
				css_speed_bonus_seconds: 120,
				penalty_enabled: false,
				css_points_per_property: 10,
				penalty_points: 0,
				penalty_mode: 'per_submission',
				allow_negative_score: false,
			}),
		).toThrow();
	});

	const validSettings = {
		name: 'X',
		default_points: 100,
		assignments_locked_by_default: true,
		allow_admin_assignment_correction: false,
		submission_max_attempts: 5,
		submission_window_seconds: 60,
		css_login_max_attempts: 5,
		css_login_window_seconds: 300,
		css_speed_bonus_points: 0,
		css_speed_bonus_seconds: 120,
		penalty_enabled: true,
		css_points_per_property: 10,
		penalty_points: 5,
		penalty_mode: 'per_property' as const,
		allow_negative_score: false,
	};

	it('acepta el modo de penalización por entrega', () => {
		expect(
			settingsInputSchema.parse({ ...validSettings, penalty_mode: 'per_submission' }).penalty_mode,
		).toBe('per_submission');
	});

	it('rechaza una penalización negativa', () => {
		expect(() => settingsInputSchema.parse({ ...validSettings, penalty_points: -1 })).toThrow();
	});

	it('rechaza un modo de penalización desconocido', () => {
		expect(() => settingsInputSchema.parse({ ...validSettings, penalty_mode: 'otro' })).toThrow();
	});

	it('rechaza puntos base por propiedad no positivos', () => {
		expect(() => settingsInputSchema.parse({ ...validSettings, css_points_per_property: 0 })).toThrow();
	});
});

describe('correctAssignmentSchema', () => {
	it('requiere un motivo de al menos 3 caracteres', () => {
		expect(
			correctAssignmentSchema.parse({
				studentId: 'b6b8f8a0-0000-4000-8000-000000000001',
				groupId: 'b6b8f8a0-0000-4000-8000-000000000002',
				reason: '  corrección aprobada  ',
			}),
		).toMatchObject({ reason: 'corrección aprobada' });

		expect(() =>
			correctAssignmentSchema.parse({
				studentId: 'b6b8f8a0-0000-4000-8000-000000000001',
				groupId: 'b6b8f8a0-0000-4000-8000-000000000002',
				reason: 'no',
			}),
		).toThrow();
	});
});

describe('credentialsSchema', () => {
	it('valida email y contraseña', () => {
		expect(credentialsSchema.parse({ email: 'admin@example.com', password: 'secreto123' })).toMatchObject({
			email: 'admin@example.com',
		});
	});

	it('rechaza correos inválidos y contraseñas cortas', () => {
		expect(() => credentialsSchema.parse({ email: 'no-es-correo', password: 'secreto123' })).toThrow();
		expect(() => credentialsSchema.parse({ email: 'a@b.co', password: '12345' })).toThrow();
	});
});

describe('purgeSchema', () => {
	it('acepta cada ámbito con su frase de confirmación exacta', () => {
		expect(
			purgeSchema.parse({ scope: 'groups', confirmation: PURGE_CONFIRMATIONS.groups }),
		).toMatchObject({ scope: 'groups' });
		expect(
			purgeSchema.parse({ scope: 'students', confirmation: PURGE_CONFIRMATIONS.students }),
		).toMatchObject({ scope: 'students' });
		expect(
			purgeSchema.parse({ scope: 'both', confirmation: PURGE_CONFIRMATIONS.both }),
		).toMatchObject({ scope: 'both' });
	});

	it('rechaza una frase que no coincide con el ámbito', () => {
		expect(() =>
			purgeSchema.parse({ scope: 'groups', confirmation: PURGE_CONFIRMATIONS.students }),
		).toThrow();
	});

	it('exige la frase completa (no solo una parte)', () => {
		expect(() => purgeSchema.parse({ scope: 'both', confirmation: 'VACIAR' })).toThrow();
		expect(() => purgeSchema.parse({ scope: 'both', confirmation: '' })).toThrow();
	});

	it('rechaza ámbitos desconocidos', () => {
		expect(() =>
			purgeSchema.parse({ scope: 'everything', confirmation: PURGE_CONFIRMATIONS.both }),
		).toThrow();
	});
});