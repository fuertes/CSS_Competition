import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { cssSubmissionSchema } from '@/lib/validation';
import {
	getCssSelectorById,
	recordRejectedAttempt,
	submitCssSelector,
} from '@/lib/data/competition';
import { getRequestGroupId } from '@/lib/auth/request-context';
import { validateSelectorSubmission } from '@/lib/css/validator';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

const GENERIC_REJECTION =
	'La entrega no es válida. Revisa la sintaxis y corrige solo el selector indicado.';

/**
 * Entrega del CSS de un selector.
 *
 * El cliente solo envía el identificador del selector y el fragmento CSS. La
 * identidad del grupo procede de la sesión, el selector autorizado se lee del
 * servidor y la puntuación la decide la función SQL transaccional. Las
 * respuestas son genéricas: nunca revelan propiedades correctas ni soluciones.
 */
export async function POST(request: NextRequest): Promise<Response> {
	const groupId = await getRequestGroupId();
	if (!groupId) return errorResponse('Sesión de grupo no válida.', 401);

	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = cssSubmissionSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse(GENERIC_REJECTION, 422);

	try {
		const selector = await getCssSelectorById(pool, parsed.data.selectorId);
		if (!selector) return errorResponse(GENERIC_REJECTION, 404);

		// 1. Validación estructural y canónica en el servidor (PostCSS).
		const validation = validateSelectorSubmission(parsed.data.css, selector.selector);
		if (!validation.ok) {
			// El motivo interno se audita; al cliente solo le llega un mensaje genérico.
			// Un error de sintaxis no aplica ningún tipo de penalización.
			await recordRejectedAttempt(pool, groupId, selector.id, validation.reason);
			return jsonResponse({
				status: 'invalid_submission',
				awarded: 0,
				penalty: 0,
				net: 0,
				new_properties: 0,
				fully_correct: false,
				speed_bonus: false,
				message: GENERIC_REJECTION,
			});
		}

		// 2. Puntuación atómica contra las reglas privadas en la base de datos.
		const result = await submitCssSelector(
			pool,
			groupId,
			selector.id,
			validation.declarations,
			parsed.data.requestId ?? null,
		);
		return jsonResponse(result);
	} catch (error) {
		console.error('[api/competicion/entregar] Error al evaluar la entrega:', error);
		return errorResponse('No se pudo evaluar la entrega.', 502);
	}
}
