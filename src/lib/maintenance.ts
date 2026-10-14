import type { PurgeScope } from '@/types';

/**
 * Definiciones compartidas por el servidor y el panel para las operaciones de
 * mantenimiento masivo. Las frases deben coincidir EXACTAMENTE con las
 * comprobadas por la función SQL `purge_entities` (migración 0014).
 *
 * Este módulo es puro (sin zod ni PostgreSQL) para poder importarse tanto en el
 * servidor como en los componentes de React.
 */

export interface PurgeDefinition {
	scope: PurgeScope;
	/** Texto del botón. */
	label: string;
	/** Frase exacta que el administrador debe escribir para confirmar. */
	confirmation: string;
	/** Título corto del diálogo. */
	title: string;
}

export const PURGE_ACTIONS: Record<PurgeScope, PurgeDefinition> = {
	groups: {
		scope: 'groups',
		label: 'Eliminar todos los grupos',
		confirmation: 'ELIMINAR TODOS LOS GRUPOS',
		title: 'Eliminar todos los grupos',
	},
	students: {
		scope: 'students',
		label: 'Eliminar todos los alumnos',
		confirmation: 'ELIMINAR TODOS LOS ALUMNOS',
		title: 'Eliminar todos los alumnos',
	},
	both: {
		scope: 'both',
		label: 'Vaciar grupos y alumnos',
		confirmation: 'VACIAR GRUPOS Y ALUMNOS',
		title: 'Vaciar grupos y alumnos',
	},
};

/** Orden de presentación de las acciones en el panel. */
export const PURGE_SCOPES: PurgeScope[] = ['groups', 'students', 'both'];
