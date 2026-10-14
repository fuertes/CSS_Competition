/**
 * Normaliza un código introducido por el usuario. Los códigos se comparan sin
 * distinguir mayúsculas/minúsculas y sin espacios sobrantes, igual que hace la
 * base de datos (que aplica `upper(trim(...))`).
 */
export function normalizeCode(value: string): string {
	return value.trim().toUpperCase();
}

const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Genera un código de acceso legible (sin caracteres ambiguos como O/0, I/1)
 * para alumnos. Usa `crypto.getRandomValues` si está disponible.
 */
export function generateAccessCode(length = 6): string {
	const size = Math.max(4, Math.min(24, Math.floor(length)));
	const bytes = new Uint8Array(size);
	if (typeof globalThis.crypto?.getRandomValues === 'function') {
		globalThis.crypto.getRandomValues(bytes);
	} else {
		for (let i = 0; i < size; i += 1) {
			bytes[i] = Math.floor(Math.random() * 256);
		}
	}
	let code = '';
	for (let i = 0; i < size; i += 1) {
		code += ACCESS_CODE_ALPHABET[bytes[i]! % ACCESS_CODE_ALPHABET.length];
	}
	return code;
}
