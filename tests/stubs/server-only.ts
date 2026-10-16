/**
 * Sustituto vacío de `server-only` para las pruebas unitarias.
 *
 * El paquete `server-only` lanza una excepción al importarse fuera de un Server
 * Component (es una marca de compilación). Vitest importa módulos de servidor
 * con dependencias simuladas, así que el alias definido en `vitest.config.mts`
 * lo sustituye por este módulo vacío. No altera el código de la aplicación.
 */
export {};
