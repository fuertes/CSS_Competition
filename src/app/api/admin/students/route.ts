import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import {
	createStudent,
	deleteStudent,
	listStudents,
	updateStudent,
} from '@/lib/data/postgres';
import { getRequestUserId } from '@/lib/auth/request-context';
import { errorResponse, jsonResponse, readJsonBody } from '@/lib/http';
import { studentInputSchema, studentUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Lista los alumnos (orden alfabético). */
export async function GET(): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);
	try {
		const students = await listStudents(pool);
		return jsonResponse({ students });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudieron cargar los alumnos.', 400);
	}
}

/** Crea un alumno. Las asignaciones se confirman aparte (`confirm_assignment`). */
export async function POST(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const parsed = studentInputSchema.safeParse(await readJsonBody(request));
	if (!parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		const student = await createStudent(pool, parsed.data);
		return jsonResponse({ id: student.id });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo crear el alumno.', 400);
	}
}

/** Actualiza un alumno (respeta las asignaciones confirmadas). */
export async function PUT(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const body = (await readJsonBody(request)) as { id?: string } | null;
	const id = typeof body?.id === 'string' ? body.id : '';
	const parsed = studentUpdateSchema.safeParse(body);
	if (!id || !parsed.success) return errorResponse('Revisa los datos introducidos.', 422);

	try {
		await updateStudent(pool, id, parsed.data);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo actualizar el alumno.', 400);
	}
}

/** Elimina un alumno. */
export async function DELETE(request: NextRequest): Promise<Response> {
	if (!(await getRequestUserId())) return errorResponse('No autorizado.', 401);
	const pool = getPool();
	if (!pool) return errorResponse('La base de datos no está configurada.', 503);

	const id = new URL(request.url).searchParams.get('id');
	if (!id) return errorResponse('Falta el identificador del alumno.', 422);

	try {
		await deleteStudent(pool, id);
		return jsonResponse({ ok: true });
	} catch (error) {
		return errorResponse(error instanceof Error ? error.message : 'No se pudo eliminar el alumno.', 400);
	}
}
