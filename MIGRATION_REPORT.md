# Informe de migración — Astro → Next.js

Resultados **reales y verificados** de la migración de `opposite-orbit` (Astro 7)
a `css-competition` (Next.js 16). Complementa a
[`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md).

- **Fecha de verificación:** 14 de octubre de 2026
- **Origen:** `../opposite-orbit` (Astro 7, `@astrojs/node`, puerto 4321) — **no
  se ha modificado**.
- **Destino:** `./` (`css-competition`, Next.js 16.4.0, App Router, puerto 3000)
- **Entorno:** Windows, Node.js 22, npm. Se ha creado un `.env` (adaptado a
  Next.js) que apunta a la base de datos **Amazon RDS** del proyecto; la conexión
  se ha verificado (ver §5.1). Las comprobaciones de solo lectura se ejecutaron
  contra esa base de datos; **no** se realizaron escrituras ni migraciones
  destructivas.

---

## 1. Resumen

| Área | Resultado |
| ---- | --------- |
| Migración funcional (páginas, API, proxy, componentes, libs) | ✅ Completada |
| `npm run typecheck` | ✅ 0 errores |
| `npm run lint` | ✅ 0 errores, 0 avisos |
| `npm test` | ✅ 9 archivos / 150 pruebas |
| `npm run build` | ✅ Next.js 16.4.0 (Turbopack), 15 páginas + 31 endpoints + proxy |
| Humo en ejecución (SSR, puertas de autenticación) | ✅ Verificado por HTTP |
| **Conexión a PostgreSQL real (RDS)** | ✅ Verificada (`db:check` + `/api/ranking` con datos reales) |
| Reglas de negocio / SQL | ⚠️ Código idéntico al origen; conexión y esquema verificados, pero los **flujos completos** (login, entrega, puntuación) **no** se ejercitaron para evitar escrituras |
| Compatibilidad de AWS Amplify con Next 16 | ⚠️ **No verificada** (depende de AWS) |
| Interacción en navegador (arrastrar y soltar, borradores, sondeo con datos) | ⚠️ **No verificada** de forma automática |

**Conclusión:** la migración está **implementada y compila/verifica** con éxito.
Lo que **no** se ha podido verificar en este entorno es todo lo que depende de una
base de datos PostgreSQL en marcha y de un navegador real (ver §6).

---

## 2. Estado real del proyecto

- **Páginas migradas:** 15 (`/`, `/ranking`, `/alumnos`, `/competicion`,
  `/competicion/entrar`, `/login`, y las 9 de `/admin/*`).
- **Route Handlers migrados:** 31 (ranking, códigos, portal de alumno, sesiones,
  competición CSS y todo el panel).
- **Proxy (antiguo middleware):** `src/proxy.ts`, con `matcher` para
  `/admin/:path*`, `/api/admin/:path*`, `/competicion/:path*` y
  `/api/competicion/:path*`.
- **Base de datos:** esquema, 14 migraciones, funciones/triggers y scripts
  **sin cambios**.
- **Pruebas:** las 9 suites / 150 pruebas del origen se conservan y pasan.

### Paridad de archivos (comparación por SHA-256)

Comparando los directorios compartidos (`database/`, `scripts/`, `tests/`,
`src/lib/…`, `src/components/`, `src/types/`):

| Categoría | Nº | Detalle |
| --------- | -- | ------- |
| **Idénticos byte a byte** | 43 | Migraciones SQL, pruebas, scripts de BD (6 de 8), `lib/css/*`, `lib/competition/draft.ts`, `lib/ranking.ts`, `lib/codes.ts`, `lib/format.ts`, `lib/maintenance.ts`, `lib/scoring.ts`, `lib/validation.ts`, `lib/http.ts`, `types/index.ts` |
| **Difieren (adaptaciones justificadas)** | 26 | Ver §3 |
| **Solo en origen (específicos de Astro)** | 9 | `components/Header.astro`, `Footer.astro`, `ui/*.astro` (5), `middleware.ts`, `types/astro.d.ts` |

---

## 3. Diferencias concretas respecto al origen

Todas las diferencias son **mecánicas y trazables** (nada de lógica de negocio):

| Archivo(s) | Cambio |
| ---------- | ------ |
| 16 componentes React (`components/**/*.tsx`) | Se añade `'use client';` (las islas de Astro usaban `client:load` en el `.astro`; en Next la directiva va en el componente). Único cambio. |
| `lib/db.ts` | `import 'server-only'`; `import.meta.env.DATABASE_URL` → `process.env.DATABASE_URL` |
| `lib/crypto/access-code.ts` | `import.meta.env.ACCESS_CODE_ENC_KEY` → `process.env.ACCESS_CODE_ENC_KEY` |
| `lib/data/{postgres,competition,maintenance}.ts` | `import 'server-only'` |
| `lib/auth/{session,group-session}.ts` | Reescritos para usar `NextResponse` (`set/clear…Cookie`) y `await cookies()` |
| `lib/config.ts` | `PUBLIC_COMPETITION_NAME` → `NEXT_PUBLIC_COMPETITION_NAME`; `server-only` |
| `scripts/create-admin.mjs`, `scripts/e2e-smoke.mjs` | Puerto `4321` → `3000` |
| `components/ranking/RankingLive.tsx` | `let timer` → `const timer` (prefer-const) |
| `components/competicion/CompetitionView.tsx` | `window.location.href` → `useRouter().replace()`; comentarios `eslint-disable` en 3 efectos de sincronización |
| `components/admin/{AdminUI,CssExerciseManager}.tsx` | Comentarios `eslint-disable` en efectos de carga deliberados |

Nuevos archivos que no existían en el origen:

- `src/proxy.ts` (reescritura del middleware).
- `src/lib/auth/request-context.ts` (identidad verificada desde cabeceras).
- `src/components/admin/AdminNav.tsx` (chrome del panel; en Astro lo aportaba el
  layout).
- `src/app/**` (páginas y layouts de App Router) y `src/components/ui/*.tsx`
  (antes `.astro`).
- Documentación: `MIGRATION_PLAN.md`, `DEPLOY_AWS_AMPLIFY.md`,
  `MIGRATION_REPORT.md`, `README.md`.

---

## 4. Verificación de compilación y pruebas

Comandos ejecutados realmente en `css-competition`:

```
npm run typecheck   → tsc --noEmit                 → 0 errores        (exit 0)
npm run lint        → eslint                        → 0 errores/avisos (exit 0)
npm test            → vitest run                    → 9 archivos, 150 pruebas (exit 0)
npm run build       → next build (Turbopack)         → build correcta    (exit 0)
```

Salida del `build` (resumen):

- **Next.js 16.4.0 (Turbopack)**, compilación correcta.
- **15 páginas** (`ƒ`, dinámicas): `/`, `/admin`, `/admin/{assignments,css,exercises,groups,maintenance,scores,settings,students}`, `/alumnos`, `/competicion`, `/competicion/entrar`, `/login`, `/ranking`.
- **31 Route Handlers** (`ƒ`): `/api/ranking`, `/api/submit-code`, `/api/student/portal`, `/api/auth/{signin,signout}`, `/api/competicion/{entrar,salir,estado,clasificacion,entregar}` y los 21 de `/api/admin/*`.
- `/ _not-found` estático.
- **`ƒ Proxy (Middleware)`** registrado.

### Incidencias resueltas durante la verificación

1. **`tsc` fallaba** por un `.next/types/validator.ts` obsoleto que referenciaba
   el `app/page.tsx`/`app/layout.tsx` del andamiaje borrado. Solución: eliminar
   `.next`.
2. **`npm run lint` fallaba** con 6 errores y 2 avisos (reglas nuevas de
   `eslint-config-next` 16 / React Compiler). Resuelto: quitar un import sin usar,
   `prefer-const`, `useRouter()` para la redirección y comentarios `eslint-disable`
   localizados y justificados en efectos de sincronización deliberados.
3. **Aviso de Vite** al cargar `vitest.config.ts` como CommonJS. Resuelto
   renombrando el archivo a **`vitest.config.mts`**. El aviso desaparece.

---

## 5. Verificación en tiempo de ejecución

Se arrancó el **servidor de producción** (`npm run start -p 3100`) además del de
desarrollo, y se comprobó por HTTP (sin `DATABASE_URL`):

| Ruta | Resultado esperado | Resultado real |
| ---- | ------------------ | -------------- |
| `/` | 200, HTML SSR | ✅ 200 (Header/Footer, títulos en español, aviso «sin PostgreSQL») |
| `/ranking` | 200 | ✅ 200 |
| `/alumnos` | 200 | ✅ 200 |
| `/login` | 200 | ✅ 200 |
| `/competicion/entrar` | 200 | ✅ 200 |
| `/api/ranking` | 503 (sin configuración) | ✅ 503 |
| `/api/competicion/estado` | 503 (sin configuración) | ✅ 503 |
| `/admin` | 307 → `/login?reason=config` | ✅ 307 → `/login?reason=config` |
| `/competicion` | 307 → `/competicion/entrar?reason=config` | ✅ 307 → `/competicion/entrar?reason=config` |

Metadatos y estructura verificados en el HTML servido:

- `<title>Competición por equipos</title>`, `theme-color` `#4f46e5`,
  `favicon.svg`.
- Enlace de salto («Saltar al contenido»), `Header` con navegación activa,
  `Footer` con el año y el nombre de la competición.
- Aviso de configuración pendiente en lugar de datos simulados.

Estas comprobaciones confirman que el **proxy autentica y redirige**, que las
**páginas de servidor renderizan** y que **no se exponen datos falsos**.

### 5.1 Verificación con `.env` y base de datos real

Se creó el archivo `.env` (no versionado: `.env*` está en `.gitignore`), **adaptado
a Next.js**:

- `PUBLIC_COMPETITION_NAME` → `NEXT_PUBLIC_COMPETITION_NAME` (el código lee el
  prefijo `NEXT_PUBLIC_`).
- Se **eliminó** `NODE_TLS_REJECT_UNAUTHORIZED=0`: la conexión usa
  `sslmode=no-verify`, que limita la exención de verificación TLS a la conexión
  con PostgreSQL en lugar de desactivarla en todo el proceso de Node.
- Resto de variables (`DATABASE_URL`, `POSTGRES_PASSWORD`, `ACCESS_CODE_ENC_KEY`,
  `ADMIN_*`) sin cambios de nombre.

Next.js carga el archivo automáticamente: el log de `next dev` muestra
`Environments: .env`, y los scripts `npm run db:*` lo cargan con
`process.loadEnvFile`.

| Comprobación | Comando | Resultado |
| ------------ | ------- | --------- |
| Conexión y esquema | `npm run db:check` | ✅ «CONEXIÓN Y ESQUEMA CORRECTOS» (todas las tablas, funciones, índices y disparadores presentes; migraciones registradas) |
| Datos reales por HTTP | `GET /api/ranking` | ✅ **200** con los grupos reales (`Grupo 1`, `Grupo 2`, …) |
| Aviso de configuración | `GET /` | ✅ Ya **no** aparece; la app está conectada |
| Puerta de administrador | `GET /admin` | ✅ **307 → `/login`** (auth normal, sin `?reason=config`) |
| Puerta de grupo | `GET /competicion` | ✅ **307 → `/competicion/entrar`** |
| Build con `.env` | `npm run build` | ✅ Compila correctamente (todas las rutas dinámicas) |

Con base de datos configurada, el proxy aplica las **redirecciones de
autenticación reales** (no la redirección de configuración), y la vista pública
sirve **datos reales, no simulados**. Los flujos que **escriben** en la base de
datos no se han ejercitado (§6).

---

## 6. Lo que NO se ha podido verificar (honestidad)

1. **Flujos que escriben en la base de datos.** La conexión, el esquema y la
   lectura de datos están verificados (§5.1), pero **no** se han ejecutado de
   extremo a extremo los flujos que **escriben**, para no alterar datos reales:
   inicio de sesión de administrador/grupo contra
   `admin_sessions`/`group_sessions`, envío de códigos, puntuación/penalización
   CSS, idempotencia, aislamiento por competición, borrado de competiciones ni
   purga masiva.
   - **Atenuante:** la lógica SQL y las funciones (`submit_exercise_code`,
     `submit_css_selector`, `round_ranking`, `delete_competition_round`,
     `purge_entities`, `recompute_group_scores`) y sus migraciones son
     **idénticas** al origen (verificado por hash), el esquema está confirmado
     por `db:check`, y las 150 pruebas unitarias (lógica pura: selector,
     importador, navegación, validación, cifrado) pasan.
2. **Scripts `db:*`.** Se ejecutó **`npm run db:check`** (solo lectura) con
   resultado correcto. Los demás (`db:migrate`, `db:seed-admin`, `db:penalty`,
   `db:competition`, `db:delete`, `db:purge`, `db:smoke`) **no se ejecutaron**
   porque escriben en la base de datos o requieren el servidor en marcha. Los
   scripts son los del origen (solo cambia el puerto por defecto de 4321 a 3000).
3. **Interacción real en navegador.** No se han probado automáticamente el
   arrastrar y soltar de asignaciones, los borradores en `localStorage`, el
   sondeo del ranking con datos vivos, ni el responsive. Solo se ha verificado el
   **HTML SSR** y las **puertas de autorización** por HTTP.
4. **Compatibilidad de AWS Amplify con Next.js 16.** Es una dependencia externa
   (adaptador de AWS) y **no** puede confirmarse desde este repositorio. Ver la
   nota inicial de [`DEPLOY_AWS_AMPLIFY.md`](./DEPLOY_AWS_AMPLIFY.md) y su plan B.
5. **Avisos de seguridad de dependencias de desarrollo.** `npm audit` reporta
   **5 vulnerabilidades de severidad alta** en dependencias **de desarrollo**
   (transitivas de `eslint-config-next`: `braces`/`micromatch`/`fast-glob`).
   `npm audit --omit=dev` reporta **0 vulnerabilidades**: las dependencias de
   **producción están limpias**. La corrección automática (`npm audit fix
   --force`) degradaría `eslint-config-next` a 14.x (cambio incompatible); se ha
   dejado como está, documentado.
6. **No se ha modificado ni borrado ningún dato real**, ni se han ejecutado
   migraciones destructivas (según lo indicado).

---

## 7. Seguridad (comprobaciones realizadas)

- **Sin secretos en el navegador:** los 16 componentes de cliente están libres de
  `import.meta`, `Astro.` y `PUBLIC_`; solo `NEXT_PUBLIC_COMPETITION_NAME` es
  público. `DATABASE_URL` y `ACCESS_CODE_ENC_KEY` solo se leen en módulos con
  `import 'server-only'`.
- **Identidad no falsificable:** el proxy **elimina** siempre los encabezados
  entrantes `x-user-id`/`x-group-id` y solo los establece tras verificar la
  sesión (comprobado leyendo `src/proxy.ts`).
- **Cookies seguras:** `HttpOnly`, `SameSite=Lax` y `Secure` en producción
  (`NODE_ENV === 'production'`).
- **Redirección de formularios:** `NextResponse.redirect(url, 303)`.
- **`.env.example` saneado:** sin credenciales reales; el archivo del origen
  contenía un endpoint RDS y claves con aspecto real y `NODE_TLS_REJECT_UNAUTHORIZED=0`,
  que **no** se han trasladado; el destino recomienda `sslmode=require`.

---

## 8. Conclusión

La migración **está implementada, compila y pasa** typecheck, lint, las 150
pruebas y el build de producción con Next.js 16; el runtime responde con el
comportamiento esperado en todas las rutas públicas y en las puertas de
autorización. El esquema y la lógica de negocio de la base de datos se
conservan **idénticos**. Lo pendiente de verificación (flujos con PostgreSQL
real, interacción en navegador y soporte de Amplify para Next 16) queda
explícitamente listado en §6, con el plan de despliegue y su alternativa en
[`DEPLOY_AWS_AMPLIFY.md`](./DEPLOY_AWS_AMPLIFY.md).
