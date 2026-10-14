import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado recuperable del código de acceso de grupo (solo servidor).
 *
 * El código de acceso de un grupo debe poder mostrarse de nuevo al profesor en
 * el panel, pero es un secreto. Por eso se guarda **cifrado** con AES-256-GCM
 * (cifrado autenticado: detecta manipulación y claves incorrectas) usando una
 * clave que vive **exclusivamente** en una variable de entorno, nunca en la
 * base de datos, el repositorio ni los registros.
 *
 * El hash bcrypt y la búsqueda HMAC que ya usaba el acceso de grupo se
 * conservan intactos: este módulo solo añade la recuperación para el panel.
 *
 * Formato del texto cifrado (base64): `iv (12 bytes) || tag (16 bytes) || ciphertext`.
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Deriva la clave de 32 bytes a partir de la variable de entorno. Acepta 64
 * caracteres hexadecimales o una cadena base64 que decodifique a 32 bytes.
 * Devuelve `null` si falta o no es válida (nunca lanza).
 */
export function deriveAccessCodeKey(raw: string | undefined | null): Buffer | null {
	const value = raw?.trim();
	if (!value) return null;

	let key: Buffer;
	try {
		key = /^[0-9a-fA-F]{64}$/.test(value)
			? Buffer.from(value, 'hex')
			: Buffer.from(value, 'base64');
	} catch {
		return null;
	}
	return key.length === KEY_BYTES ? key : null;
}

/** Cifra un código con una clave explícita (no usa el entorno). */
export function encryptAccessCodeWithKey(key: Buffer, code: string): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Descifra un código con una clave explícita. Devuelve `null` ante cualquier
 * fallo (datos manipulados, formato inválido o clave incorrecta); nunca lanza.
 */
export function decryptAccessCodeWithKey(key: Buffer, payload: string): string | null {
	if (!payload) return null;

	try {
		const data = Buffer.from(payload, 'base64');
		if (data.length <= IV_BYTES + TAG_BYTES) return null;

		const iv = data.subarray(0, IV_BYTES);
		const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
		const ciphertext = data.subarray(IV_BYTES + TAG_BYTES);

		const decipher = createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
	} catch {
		return null;
	}
}

function environmentKey(): Buffer | null {
	return deriveAccessCodeKey(process.env.ACCESS_CODE_ENC_KEY);
}

/** ¿Está configurada la clave de cifrado de códigos de acceso? */
export function isAccessCodeEncryptionConfigured(): boolean {
	return environmentKey() !== null;
}

/**
 * Cifra un código usando la clave del entorno. Lanza si la clave no está
 * configurada: generar un código sin poder almacenarlo de forma recuperable
 * dejaría una funcionalidad a medias.
 */
export function encryptAccessCode(code: string): string {
	const key = environmentKey();
	if (!key) {
		throw new Error(
			'Falta la clave de cifrado de códigos de acceso (ACCESS_CODE_ENC_KEY).',
		);
	}
	return encryptAccessCodeWithKey(key, code);
}

/** Descifra un código usando la clave del entorno; `null` si no es recuperable. */
export function decryptAccessCode(payload: string | null | undefined): string | null {
	const key = environmentKey();
	if (!key || !payload) return null;
	return decryptAccessCodeWithKey(key, payload);
}
