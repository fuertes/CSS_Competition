import { z } from 'zod';
import { PURGE_ACTIONS } from '@/lib/maintenance';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const codeSchema = z
	.string()
	.trim()
	.min(1, 'El código no puede estar vacío')
	.max(64, 'El código es demasiado largo');

export const groupInputSchema = z.object({
	name: z.string().trim().min(1, 'El nombre es obligatorio').max(60, 'Máximo 60 caracteres'),
	color: z.string().regex(HEX_COLOR, 'Color hexadecimal no válido'),
	active: z.boolean().default(true),
});

export const studentInputSchema = z.object({
	name: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
	group_id: z.uuid().nullable().default(null),
	active: z.boolean().default(true),
});

export const exerciseInputSchema = z.object({
	title: z.string().trim().min(1, 'El título es obligatorio').max(120, 'Máximo 120 caracteres'),
	description: z.string().trim().max(500, 'Máximo 500 caracteres').nullable().default(null),
	points: z.coerce
		.number()
		.int('Debe ser un número entero')
		.min(1, 'Mínimo 1 punto')
		.max(100000, 'Demasiados puntos'),
	active: z.boolean().default(true),
	archived: z.boolean().default(false),
});

export const settingsInputSchema = z.object({
	name: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
	default_points: z.coerce.number().int().min(1).max(100000),
	assignments_locked_by_default: z.boolean(),
	allow_admin_assignment_correction: z.boolean(),
	submission_max_attempts: z.coerce.number().int().min(1).max(1000),
	submission_window_seconds: z.coerce.number().int().min(10).max(86400),
	css_login_max_attempts: z.coerce.number().int().min(1).max(100),
	css_login_window_seconds: z.coerce.number().int().min(10).max(86400),
	css_speed_bonus_points: z.coerce.number().int().min(0).max(100000),
	css_speed_bonus_seconds: z.coerce.number().int().min(0).max(86400),
	penalty_enabled: z.boolean(),
	penalty_points: z.coerce.number().int().min(0).max(100000),
	penalty_mode: z.enum(['per_property', 'per_submission']),
	allow_negative_score: z.boolean(),
	css_points_per_property: z.coerce.number().int().min(1).max(100000),
});

export const submitCodeSchema = z.object({
	studentCode: codeSchema,
	exerciseCode: codeSchema,
});

export const studentPortalSchema = z.object({
	studentCode: codeSchema,
});

export const assignmentSchema = z.object({
	studentId: z.uuid(),
	groupId: z.uuid(),
});

export const correctAssignmentSchema = assignmentSchema.extend({
	reason: z.string().trim().min(3, 'Indica un motivo').max(300, 'Máximo 300 caracteres'),
});

export const credentialsSchema = z.object({
	email: z.email('Correo no válido'),
	password: z.string().min(6, 'Al menos 6 caracteres').max(200),
});

/** Actualización parcial de una entidad (para los endpoints del panel). */
export const groupUpdateSchema = groupInputSchema.partial();
export const studentUpdateSchema = studentInputSchema.partial();
export const exerciseUpdateSchema = exerciseInputSchema.partial();
export const settingsUpdateSchema = settingsInputSchema.partial();

export const setExerciseCodeSchema = z.object({
	exerciseId: z.uuid(),
	code: codeSchema,
});

export const setStudentAccessCodeSchema = z.object({
	studentId: z.uuid(),
	code: codeSchema,
});

export const generateGroupAccessCodeSchema = z.object({
	groupId: z.uuid(),
});

export const groupLoginSchema = z.object({
	code: codeSchema,
});

export const cssSubmissionSchema = z.object({
	selectorId: z.uuid(),
	css: z.string().trim().min(1, 'Escribe CSS para corregir').max(8000, 'CSS demasiado largo'),
	/** Clave de idempotencia de la entrega (evita dobles penalizaciones por reintentos). */
	requestId: z.uuid().optional(),
});

export const cssExerciseInputSchema = z.object({
	title: z.string().trim().min(1, 'El título es obligatorio').max(120, 'Máximo 120 caracteres'),
	description: z.string().trim().max(500, 'Máximo 500 caracteres').nullable().default(null),
});

export const cssSelectorInputSchema = z.object({
	exerciseId: z.uuid(),
	selector: z.string().trim().min(1, 'Escribe un selector CSS').max(200, 'Máximo 200 caracteres'),
});

export const cssSelectorUpdateSchema = z.object({
	id: z.uuid(),
	selector: z.string().trim().min(1, 'Escribe un selector CSS').max(200).optional(),
	active: z.boolean().optional(),
});

export const cssRuleInputSchema = z.object({
	selectorId: z.uuid(),
	property: z
		.string()
		.trim()
		.min(1, 'Escribe una propiedad CSS')
		.max(60, 'Máximo 60 caracteres'),
	expectedValue: z
		.string()
		.trim()
		.min(1, 'Escribe el valor esperado')
		.max(500, 'Máximo 500 caracteres'),
	points: z.coerce.number().int().min(1, 'Mínimo 1 punto').max(1000, 'Máximo 1000 puntos'),
});

export const cssRuleUpdateSchema = z.object({
	id: z.uuid(),
	property: z.string().trim().min(1).max(60).optional(),
	expectedValue: z.string().trim().min(1).max(500).optional(),
	points: z.coerce.number().int().min(1).max(1000).optional(),
});

export const startRoundSchema = z.object({
	exerciseId: z.uuid(),
});

/** Identificador de una competición (ronda) a eliminar. */
export const deleteRoundSchema = z.object({
	id: z.uuid(),
});

/** Ámbitos de purga masiva de mantenimiento. */
export const purgeScopeSchema = z.enum(['groups', 'students', 'both']);

/**
 * Frase que el administrador debe escribir para confirmar cada purga masiva.
 * Debe coincidir EXACTAMENTE con la comprobada en `purge_entities` (migración
 * 0014): la validación del servidor es la fuente de verdad.
 */
export const PURGE_CONFIRMATIONS = {
	groups: PURGE_ACTIONS.groups.confirmation,
	students: PURGE_ACTIONS.students.confirmation,
	both: PURGE_ACTIONS.both.confirmation,
} as const;

/** Purga masiva: ámbito + frase de confirmación escrita. */
export const purgeSchema = z
	.object({
		scope: purgeScopeSchema,
		confirmation: z.string().trim().min(1, 'Escribe la confirmación').max(60),
	})
	.refine((data) => data.confirmation === PURGE_CONFIRMATIONS[data.scope], {
		message: 'La frase de confirmación no coincide.',
		path: ['confirmation'],
	});

/** Importación de CSS de referencia: análisis del bloque pegado por el profesor. */
export const cssImportAnalyzeSchema = z.object({
	css: z.string().min(1, 'Pega un bloque CSS').max(20000, 'El CSS es demasiado largo'),
});

const cssImportDeclarationSchema = z.object({
	name: z.string().trim().min(1, 'Falta la propiedad').max(60, 'Propiedad demasiado larga'),
	expectedValue: z.string().trim().min(1, 'Falta el valor esperado').max(500, 'Valor demasiado largo'),
	points: z.coerce.number().int().min(1).max(1000).optional(),
});

const cssImportSelectorSchema = z.object({
	selector: z.string().trim().min(1, 'Falta el selector').max(200, 'Selector demasiado largo'),
	declarations: z
		.array(cssImportDeclarationSchema)
		.min(1, 'Cada selector necesita al menos una propiedad')
		.max(50, 'Demasiadas propiedades en un selector'),
});

/** Importación de CSS de referencia: guardado del ejercicio revisado. */
export const cssImportSaveSchema = z.object({
	exerciseId: z.uuid().nullable().default(null),
	title: z.string().trim().min(1, 'El título es obligatorio').max(120, 'Máximo 120 caracteres'),
	description: z.string().trim().max(500, 'Máximo 500 caracteres').nullable().default(null),
	basePoints: z.coerce.number().int().min(1).max(1000).default(10),
	selectors: z
		.array(cssImportSelectorSchema)
		.min(1, 'Añade al menos un selector')
		.max(100, 'Demasiados selectores'),
});

/**
 * Nombre de una partida de La Oca del Caos. Igual que el resto de nombres de la
 * aplicación: se recorta y se acota; la comprobación real de "no vacío" vuelve a
 * hacerse en el servidor.
 */
export const ocaGameNameSchema = z
	.string()
	.trim()
	.min(1, 'El nombre es obligatorio')
	.max(80, 'Máximo 80 caracteres');

/**
 * Alta de una partida de La Oca: nombre + grupos participantes.
 *
 * `groupIds` son identificadores (UUID) que el servidor vuelve a contrastar
 * contra la base de datos (existencia y estado activo); nunca se confía en la
 * lista del cliente. Se exige al menos un grupo. No se impone un máximo de
 * grupos: el diseño aprobado no define ese límite, así que no se inventa.
 */
export const createOcaGameSchema = z.object({
	name: ocaGameNameSchema,
	groupIds: z.array(z.uuid()).min(1, 'Selecciona al menos un grupo'),
});

/** Acciones de asignación admitidas por el endpoint del panel. */
export const assignmentActionSchema = z.discriminatedUnion('action', [
	assignmentSchema.extend({ action: z.literal('confirm') }),
	z.object({ action: z.literal('clear'), studentId: z.uuid() }),
	correctAssignmentSchema.extend({ action: z.literal('correct') }),
]);

export type GroupInput = z.infer<typeof groupInputSchema>;
export type StudentInput = z.infer<typeof studentInputSchema>;
export type ExerciseInput = z.infer<typeof exerciseInputSchema>;
export type SettingsInput = z.infer<typeof settingsInputSchema>;
export type SubmitCodeInput = z.infer<typeof submitCodeSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type CredentialsInput = z.infer<typeof credentialsSchema>;
export type GroupUpdateInput = z.infer<typeof groupUpdateSchema>;
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;
export type ExerciseUpdateInput = z.infer<typeof exerciseUpdateSchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
export type AssignmentActionInput = z.infer<typeof assignmentActionSchema>;
export type GroupLoginInput = z.infer<typeof groupLoginSchema>;
export type CssSubmissionInput = z.infer<typeof cssSubmissionSchema>;
export type CssExerciseInput = z.infer<typeof cssExerciseInputSchema>;
export type CssSelectorInput = z.infer<typeof cssSelectorInputSchema>;
export type CssSelectorUpdateInput = z.infer<typeof cssSelectorUpdateSchema>;
export type CssRuleInput = z.infer<typeof cssRuleInputSchema>;
export type CssRuleUpdateInput = z.infer<typeof cssRuleUpdateSchema>;
export type StartRoundInput = z.infer<typeof startRoundSchema>;
export type CssImportAnalyzeInput = z.infer<typeof cssImportAnalyzeSchema>;
export type CssImportSaveInput = z.infer<typeof cssImportSaveSchema>;
export type PurgeScopeInput = z.infer<typeof purgeScopeSchema>;
export type PurgeInput = z.infer<typeof purgeSchema>;
export type CreateOcaGameInput = z.infer<typeof createOcaGameSchema>;
