# Plan de migración — de Astro (`opposite-orbit`) a Next.js (`css-competition`)

Este documento describe **qué** se migra, **cómo** y **cómo se comprueba**. Es la
referencia de la migración de la plataforma educativa de competición por equipos
desde Astro 7 (SSR con `@astrojs/node`) a Next.js 16 (App Router).

- **Origen (referencia, no se modifica):** `../opposite-orbit`
- **Destino (aplicación migrada):** `./` (`css-competition`)

---

## 1. Objetivo y alcance

Reescribir la aplicación en Next.js conservando **de forma verificable**:

- el **modelo de datos** PostgreSQL (esquema, migraciones, nombres de tablas y
  columnas, funciones y disparadores),
- las **reglas de negocio** de puntuación, penalización, idempotencia y
  aislamiento por competición (no se simplifica la puntuación),
- la **identidad visual**, el diseño responsive, el arrastrar y soltar y los
  estados de carga/error/deshabilitado,
- el **modelo de seguridad** (autorización en servidor, cookies `HttpOnly`,
  validación Zod, sin secretos en el navegador).

**Fuera de alcance:** cambiar el esquema o los datos existentes, migrar datos,
tocar el proyecto Astro original, sustituir la base de datos o introducir
frameworks de estilos distintos de Tailwind.

---

## 2. Inventario de funcionalidades

| # | Funcionalidad | Origen (`opposite-orbit`) | Destino (`css-competition`) | Estado |
| - | ------------- | ------------------------- | --------------------------- | ------ |
| 1 | Home público | `src/pages/index.astro` | `src/app/(site)/page.tsx` | Migrado |
| 2 | Ranking público en vivo (sondeo 5 s) | `src/pages/ranking.astro` + `components/ranking/*` | `src/app/(site)/ranking/page.tsx` + `components/ranking/*` | Migrado |
| 3 | Portal del alumno (código personal) | `src/pages/alumnos.astro` + `components/students/StudentPortal.tsx` | `src/app/(site)/alumnos/page.tsx` + `components/students/StudentPortal.tsx` | Migrado |
| 4 | Entrada a la competición CSS | `src/pages/competicion.astro`, `competicion/entrar.astro` | `src/app/(site)/competicion/page.tsx`, `competicion/entrar/page.tsx` | Migrado |
| 5 | Corrección CSS por grupo (selectores, borradores, idempotencia) | `components/competicion/CompetitionView.tsx` | `src/components/competicion/CompetitionView.tsx` | Migrado |
| 6 | Acceso de administrador | `src/pages/login.astro` + `api/auth/*` | `src/app/(site)/login/page.tsx` + `api/auth/*` | Migrado |
| 7 | Panel: grupos (código 5 car., acceso cifrado recuperable) | `admin/groups` | `src/app/admin/groups/page.tsx` | Migrado |
| 8 | Panel: alumnos y códigos | `admin/students` | `src/app/admin/students/page.tsx` | Migrado |
| 9 | Panel: asignaciones (arrastrar y soltar) | `admin/assignments` + `AssignmentsBoard.tsx` | `src/app/admin/assignments/page.tsx` | Migrado |
| 10 | Panel: ejercicios y código secreto | `admin/exercises` | `src/app/admin/exercises/page.tsx` | Migrado |
| 11 | Panel CSS: ejercicios, selectores, reglas, rondas | `admin/css` + `CssExerciseManager.tsx`, `CompetitionsManager.tsx` | `src/app/admin/css/page.tsx` | Migrado |
| 12 | Importador de CSS de referencia (PostCSS) | `CssImporter.tsx` + `lib/css/*` | `src/components/admin/CssImporter.tsx` | Migrado |
| 13 | Panel: puntuaciones | `admin/scores` + `ScoresPanel.tsx` | `src/app/admin/scores/page.tsx` | Migrado |
| 14 | Panel: configuración (puntos, penalización, saldo) | `admin/settings` + `SettingsPanel.tsx` | `src/app/admin/settings/page.tsx` | Migrado |
| 15 | Mantenimiento: purga masiva | `admin/maintenance` + `DataMaintenancePanel.tsx` | `src/app/admin/maintenance/page.tsx` | Migrado |
| 16 | Estado «sin configurar» (sin `DATABASE_URL`) | `components/ui/ConfigNotice.astro` | `src/components/ui/ConfigNotice.tsx` | Migrado |
| 17 | Sesiones de admin y de grupo | `lib/auth/*` | `src/lib/auth/*` | Adaptado a `NextResponse` |
| 18 | Middleware de autenticación | `src/middleware.ts` | `src/proxy.ts` (ver §6) | Adaptado |
| 19 | Migraciones SQL + scripts de BD | `database/`, `scripts/*.mjs` | idénticos (copiados sin cambios) | Conservado |
| 20 | Pruebas unitarias (selector, importador, navegación, validación, cifrado) | `tests/*` | idénticos | Conservado |

---

## 3. Mapa de rutas origen → destino

Todas las rutas se conservan **idénticas** (no hay cambios de URL para el
usuario). El cambio es de mecanismo:

- Astro: una página `.astro` por ruta y un endpoint `.ts` por API.
- Next.js: una `page.tsx` bajo `src/app/` y un `route.ts` bajo `src/app/api/`.

### 3.1 Páginas (15)

| URL | Origen | Destino |
| --- | ------ | ------- |
| `/` | `pages/index.astro` | `app/(site)/page.tsx` |
| `/ranking` | `pages/ranking.astro` | `app/(site)/ranking/page.tsx` |
| `/alumnos` | `pages/alumnos.astro` | `app/(site)/alumnos/page.tsx` |
| `/competicion` | `pages/competicion.astro` | `app/(site)/competicion/page.tsx` |
| `/competicion/entrar` | `pages/competicion/entrar.astro` | `app/(site)/competicion/entrar/page.tsx` |
| `/login` | `pages/login.astro` | `app/(site)/login/page.tsx` |
| `/admin` | `pages/admin/index.astro` | `app/admin/page.tsx` |
| `/admin/students` | `pages/admin/students.astro` | `app/admin/students/page.tsx` |
| `/admin/groups` | `pages/admin/groups.astro` | `app/admin/groups/page.tsx` |
| `/admin/assignments` | `pages/admin/assignments.astro` | `app/admin/assignments/page.tsx` |
| `/admin/exercises` | `pages/admin/exercises.astro` | `app/admin/exercises/page.tsx` |
| `/admin/css` | `pages/admin/css.astro` | `app/admin/css/page.tsx` |
| `/admin/scores` | `pages/admin/scores.astro` | `app/admin/scores/page.tsx` |
| `/admin/settings` | `pages/admin/settings.astro` | `app/admin/settings/page.tsx` |
| `/admin/maintenance` | `pages/admin/maintenance.astro` | `app/admin/maintenance/page.tsx` |

### 3.2 API (31)

| URL | Origen | Destino |
| --- | ------ | ------- |
| `/api/ranking` | `pages/api/ranking.ts` | `app/api/ranking/route.ts` |
| `/api/submit-code` | `pages/api/submit-code.ts` | `app/api/submit-code/route.ts` |
| `/api/student/portal` | `pages/api/student/portal.ts` | `app/api/student/portal/route.ts` |
| `/api/auth/signin` | `pages/api/auth/signin.ts` | `app/api/auth/signin/route.ts` |
| `/api/auth/signout` | `pages/api/auth/signout.ts` | `app/api/auth/signout/route.ts` |
| `/api/competicion/entrar` | `…/entrar.ts` | `app/api/competicion/entrar/route.ts` |
| `/api/competicion/salir` | `…/salir.ts` | `app/api/competicion/salir/route.ts` |
| `/api/competicion/estado` | `…/estado.ts` | `app/api/competicion/estado/route.ts` |
| `/api/competicion/clasificacion` | `…/clasificacion.ts` | `app/api/competicion/clasificacion/route.ts` |
| `/api/competicion/entregar` | `…/entregar.ts` | `app/api/competicion/entregar/route.ts` |
| `/api/admin/students` | `…/students.ts` | `app/api/admin/students/route.ts` |
| `/api/admin/students/code` | `…/students/code.ts` | `app/api/admin/students/code/route.ts` |
| `/api/admin/groups` | `…/groups.ts` | `app/api/admin/groups/route.ts` |
| `/api/admin/groups/code` | `…/groups/code.ts` | `app/api/admin/groups/code/route.ts` |
| `/api/admin/groups/access-codes` | `…/groups/access-codes.ts` | `app/api/admin/groups/access-codes/route.ts` |
| `/api/admin/assignments` | `…/assignments.ts` | `app/api/admin/assignments/route.ts` |
| `/api/admin/exercises` | `…/exercises.ts` | `app/api/admin/exercises/route.ts` |
| `/api/admin/exercises/code` | `…/exercises/code.ts` | `app/api/admin/exercises/code/route.ts` |
| `/api/admin/scores` | `…/scores.ts` | `app/api/admin/scores/route.ts` |
| `/api/admin/settings` | `…/settings.ts` | `app/api/admin/settings/route.ts` |
| `/api/admin/css/exercises` | `…/css/exercises.ts` | `app/api/admin/css/exercises/route.ts` |
| `/api/admin/css/exercise` | `…/css/exercise.ts` | `app/api/admin/css/exercise/route.ts` |
| `/api/admin/css/selectors` | `…/css/selectors.ts` | `app/api/admin/css/selectors/route.ts` |
| `/api/admin/css/selector` | `…/css/selector.ts` | `app/api/admin/css/selector/route.ts` |
| `/api/admin/css/rules` | `…/css/rules.ts` | `app/api/admin/css/rules/route.ts` |
| `/api/admin/css/rule` | `…/css/rule.ts` | `app/api/admin/css/rule/route.ts` |
| `/api/admin/css/rounds` | `…/css/rounds.ts` | `app/api/admin/css/rounds/route.ts` |
| `/api/admin/css/rounds/end` | `…/css/rounds/end.ts` | `app/api/admin/css/rounds/end/route.ts` |
| `/api/admin/css/import/analyze` | `…/css/import/analyze.ts` | `app/api/admin/css/import/analyze/route.ts` |
| `/api/admin/css/import/save` | `…/css/import/save.ts` | `app/api/admin/css/import/save/route.ts` |
| `/api/admin/maintenance/purge` | `…/maintenance/purge.ts` | `app/api/admin/maintenance/purge/route.ts` |

---

## 4. Componentes reutilizables y arquitectura

### 4.1 Componentes

| Origen (Astro/React) | Destino (Next) | Notas |
| -------------------- | -------------- | ----- |
| `components/Header.astro` | `components/Header.tsx` (`'use client'`) | Usa `usePathname` para el estado activo; recibe `competitionName` |
| `components/Footer.astro` | `components/Footer.tsx` (server) | Recibe `competitionName` |
| `components/ui/*.astro` | `components/ui/*.tsx` (server) | `Alert`, `Card`, `ConfigNotice`, `EmptyState`, `StatCard` |
| `components/ranking/*.tsx` | idénticos (`'use client'`) | `Podium`, `RankingList`, `RankingLive` |
| `components/students/StudentPortal.tsx` | idéntico | `'use client'` |
| `components/competicion/CompetitionView.tsx` | idéntico | `'use client'` |
| `components/admin/*.tsx` | idénticos | `'use client'`; se añade `AdminNav.tsx` (chrome del panel) |

### 4.2 Capa de datos y lógica (sin cambios de contenido)

`lib/css/*`, `lib/competition/draft.ts`, `lib/crypto/access-code.ts`,
`lib/ranking.ts`, `lib/codes.ts`, `lib/format.ts`, `lib/maintenance.ts`,
`lib/scoring.ts`, `lib/validation.ts`, `lib/http.ts`, `lib/db.ts`,
`lib/data/*`, `types/index.ts` se **conservan**. Los módulos que solo deben
ejecutarse en el servidor llevan `import 'server-only'`
(`db`, `config`, `data/postgres`, `data/competition`, `data/maintenance`,
`auth/*`).

### 4.3 Diferencias de plataforma (puntos de fricción resueltos)

| Astro | Next.js 16 |
| ----- | ---------- |
| `Astro.request.headers` / `Astro.locals` | `await headers()` + cabeceras `x-user-id`/`x-group-id` inyectadas por `proxy.ts` |
| `Astro.cookies` | `await cookies()` |
| `Astro.url.searchParams` | `await searchParams` (Promise) |
| `Astro.params` | `await params` (Promise) |
| API `APIRoute` con `context` | `route.ts` con `(request: NextRequest, ctx)` |
| `src/middleware.ts` (`defineMiddleware`) | `src/proxy.ts` (export `proxy` + `config.matcher`) |
| `import.meta.env.PROD` | `process.env.NODE_ENV === 'production'` |
| `PUBLIC_*` | `NEXT_PUBLIC_*` |
| Redirect desde endpoint | `NextResponse.redirect(url, 303)` |
| `<Layout>` + `<slot/>` | `layout.tsx` + `children`, route groups `(site)` |
| Tailwind vía `@tailwindcss/vite` | Tailwind 4 vía `@tailwindcss/turbopack` (Turbopack) |

---

## 5. Dependencias: mantener, reemplazar y eliminar

### 5.1 Se mantienen (mismas versiones o equivalentes)

| Paquete | Motivo |
| ------- | ------ |
| `pg` | mismo acceso a PostgreSQL; el esquema no cambia |
| `zod` | mismos esquemas de validación |
| `postcss`, `postcss-selector-parser`, `postcss-value-parser` | mismo motor de análisis CSS |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | misma tabla de asignaciones con arrastrar y soltar |
| `react`, `react-dom` (19) | componentes de cliente sin cambios |
| `tailwindcss` (4) | misma identidad visual |
| `vitest` (5) | mismas 150 pruebas |
| `@types/node`, `@types/pg`, `@types/react`, `@types/react-dom` | tipado |

### 5.2 Se reemplazan

| Origen | Destino | Motivo |
| ------ | ------- | ------ |
| `astro` | `next` 16.4.0 | framework de destino |
| `@astrojs/node` | runtime SSR de Next | adaptador de servidor |
| `@astrojs/react` | integración nativa de React | React es de primera clase en Next |
| `@astrojs/check` | `next build` + `tsc --noEmit` | verificación de tipos |
| `@tailwindcss/vite` | `@tailwindcss/turbopack` | Tailwind 4 sobre Turbopack |
| `typescript` ^6 (origen) | `typescript` ^5 | compatibilidad con `eslint-config-next`; sin pérdida de tipado estricto |

### 5.3 Se eliminan (o no se incorporan)

`astro`, `@astrojs/*`, y cualquier configuración específica de Astro
(`astro.config.mjs`, `.astro` en `tsconfig`, etc.). No se añaden frameworks de
estilos, gestores de estado ni clientes de datos nuevos.

### 5.4 Se añaden

| Paquete | Motivo |
| ------- | ------ |
| `next`, `eslint-config-next` | framework y lint oficial |
| `server-only` | marcar módulos exclusivos de servidor |
| `@tailwindcss/turbopack` | compilar Tailwind 4 en Next 16 |

---

## 6. Estrategia de migración (por fases)

La migración se ejecuta en fases pequeñas y verificables. La aplicación Astro
original **permanece intacta** como referencia hasta completar la verificación.

1. **Fase 0 — Andamiaje.** Crear `css-competition` con `create-next-app`
   (TypeScript estricto, Tailwind 4, App Router, `src/`). Ajustar
   `next.config.ts`, `tsconfig.json`, `package.json` (scripts), ESLint y
   `.gitignore`. Copiar `database/`, `scripts/`, `tests/`, `public/` y los
   módulos de `lib` que no dependen de Astro.
2. **Fase 1 — Núcleo de servidor.** Portar `db`, `config`, `auth/*` (a
   `NextResponse`), `crypto/access-code`, `data/*` y `types`. Añadir
   `server-only`. Introducir `auth/request-context.ts`.
3. **Fase 2 — Proxy.** Reescribir `src/middleware.ts` como `src/proxy.ts`
   (export `proxy`, runtime Node.js, `config.matcher`), inyectando
   `x-user-id`/`x-group-id` tras verificar la sesión.
4. **Fase 3 — API.** Portar los 31 endpoints a `app/api/**/route.ts`.
5. **Fase 4 — UI.** Portar los componentes (`'use client'` donde procede) y los
   `ui/*` como componentes de servidor.
6. **Fase 5 — Páginas y layouts.** Crear el layout raíz (html/body, metadatos,
   `viewport`), el layout `(site)` (Header/Footer + enlace de salto) y el layout
   `admin` (chrome del panel). Portar las 15 páginas.
7. **Fase 6 — Verificación.** `typecheck`, `lint`, `test`, `build` y humo en
   tiempo de ejecución (`curl`).
8. **Fase 7 — Documentación.** `DEPLOY_AWS_AMPLIFY.md`, `README.md` y
   `MIGRATION_REPORT.md`.

La migración de datos **no es necesaria**: la base de datos es la misma y no se
ejecutan migraciones destructivas.

---

## 7. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| Diferencias de SSR entre Astro y Next (headers, cookies, params) | Alto | Adaptar en `proxy.ts`, `request-context.ts` y helpers de cookies con `NextResponse` |
| Autenticación saltada al portar el middleware | Alto (seguridad) | `proxy.ts` con `matcher`, saneo de cabeceras y verificación de sesión; probado en ejecución (307/401/503) |
| `import.meta.env` / `Astro.*` residuales en componentes | Medio | Auditoría: 16 componentes de cliente sin `import.meta`/`Astro.`/`PUBLIC_` |
| Tailwind 4 no compila en Next 16 | Medio | Regla `*.css → @tailwindcss/turbopack`; verificado en build y en HTML servido |
| Reglas de puntuación alteradas al portar | Crítico | Las funciones SQL y la lógica de `lib/*` se copian **sin cambios**; pruebas unitarias intactas |
| Fuga de `DATABASE_URL` al navegador | Crítico | Solo servidor (`server-only`), sin `NEXT_PUBLIC_`; `/api/*` como única frontera |
| Divergencia de comportamiento en formularios (redirect tras POST) | Medio | `NextResponse.redirect(url, 303)` para POST de formularios |
| `.next` obsoleto rompe `tsc` | Bajo | Limpiar `.next` antes de `typecheck` |
| Dependencias de desarrollo con avisos de seguridad | Bajo | `npm audit --omit=dev` = 0; avisos en `eslint-config-next` (solo desarrollo) |

---

## 8. Criterios de aceptación (verificables)

1. **`npm run typecheck`** termina con **0 errores**.
2. **`npm run lint`** termina **sin errores ni avisos**.
3. **`npm test`** ejecuta **9 archivos / 150 pruebas** y todas pasan, sin avisos.
4. **`npm run build`** compila con **Next.js 16 (Turbopack)** y lista **15
   páginas + 31 endpoints** como dinámicos, con **Proxy (Middleware)**
   registrado.
5. **`npm run dev`** sirve `/`, `/ranking`, `/alumnos`, `/login`,
   `/competicion/entrar` con **HTTP 200** y contenido SSR correcto (título,
   metadatos, Header/Footer en español).
6. **Sin `DATABASE_URL`**, las páginas muestran el **aviso de configuración** y
   `/admin` redirige a `/login?reason=config`; los endpoints `/api/*`
   protegidos responden **503**.
7. Con sesión inválida, `/admin` redirige a `/login` y
   `/api/admin/*` responde **401**; `/competicion` redirige a
   `/competicion/entrar`.
8. El esquema, las migraciones, las funciones SQL y los scripts de base de
   datos son **idénticos** a los del origen.
9. **Ningún** valor sensible aparece en el código del navegador ni en
   `NEXT_PUBLIC_*`.
10. La documentación (`README.md`, `DEPLOY_AWS_AMPLIFY.md`,
    `MIGRATION_REPORT.md`) refleja el estado real y las limitaciones.

El cumplimiento de cada criterio se registra en `MIGRATION_REPORT.md`.
