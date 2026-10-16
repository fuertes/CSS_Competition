import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(import.meta.dirname, 'src'),
			// `server-only` es una marca de compilación que lanza al importarse
			// fuera de un Server Component. Las pruebas unitarias importan
			// módulos de servidor con dependencias simuladas, así que se
			// sustituye por un módulo vacío. No afecta al código de la app.
			'server-only': path.resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
		},
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
	},
});
