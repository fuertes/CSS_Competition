# AGENTS.md — Plataforma educativa de competición por equipos

> Este archivo describe la implementación **actual** del proyecto: la aplicación
> **Next.js** de este repositorio (`css-competition`). El proyecto original en
> Astro (`../opposite-orbit`) se conserva como referencia histórica y **no debe
> modificarse ni tomarse como fuente de verdad del código actual**.

## 1. Objetivo del proyecto

Aplicación web educativa para gestionar alumnos, asignarlos a grupos, resolver
ejercicios mediante códigos secretos, **corregir CSS en equipo** y mostrar la
clasificación de la competición.

Debe ser responsive, accesible, segura, visualmente atractiva y mantenible.

## 2. Reglas generales de desarrollo

* **No des nada por supuesto:** antes de afirmar cómo funciona algo o de
  cambiarlo, compruébalo en el código, la configuración y el esquema reales
  (versiones instaladas en `package.json`, `src/`, `database/migrations/`).
* Antes de modificar archivos, inspecciona su contenido y comprende su función.
* Respeta la arquitectura y las convenciones existentes.
* No recrees el proyecto ni reinstales dependencias que ya estén disponibles.
* No elimines funcionalidades existentes sin una justificación explícita.
* Usa TypeScript y evita `any` salvo que sea estrictamente necesario.
* Divide la aplicación en componentes pequeños, reutilizables y con responsabilidades claras.
* Separa la presentación, la lógica de negocio, el acceso a datos y la validación.
* Evita duplicar código, lógica de negocio o estilos.
* No añadas dependencias sin comprobar primero si son necesarias y compatibles.
* No consideres una funcionalidad terminada hasta verificar su comportamiento y ejecutar las comprobaciones pertinentes.
* Si una decisión afecta a la seguridad, la persistencia o la integridad de los datos, prioriza una solución robusta frente a un atajo de implementación.
* No modifiques ni borres datos de la base de datos real ni ejecutes migraciones destructivas sin autorización expresa.

## 3. Stack tecnológico

Versiones verificadas en `package.json` (no las actualices a ciegas):

| Área | Tecnología |
| --- | --- |
| Framework | **Next.js 16.4.0** (App Router, Turbopack por defecto) |
| UI | **React 19.3.0** + **React DOM 19.3.0** |
| Lenguaje | **TypeScript** (`strict: true`), alias `@/*` → `./src/*` |
| Estilos | **Tailwind CSS 4** vía el loader de Turbopack (`@tailwindcss/turbopack`) |
| Base de datos | **PostgreSQL** con **`pg` (node-postgres)** — sin ORM |
| Validación | **Zod 4** |
| Arrastrar y soltar | **`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`** |
| Análisis de CSS | **`postcss` + `postcss-selector-parser` + `postcss-value-parser`** |
| Pruebas | **Vitest 5** |
| Lint | **ESLint 9** (`eslint-config-next`) |
| Aislamiento servidor | **`server-only`** |
| Runtime | **Node.js ≥ 22.12.0** (`engines.node`) |

Particularidades de Next.js 16 que **cambian** respecto a versiones anteriores:

* El middleware se llama **`src/proxy.ts`** y exporta la función `proxy`
  (runtime Node.js). No existe `middleware.ts`.
* `cookies()`, `headers()`, `params` y `searchParams` son **asíncronos** (`await`).
* `next lint` ya **no existe**: el script `lint` ejecuta `eslint` directamente.
* Turbopack es el bundler por defecto.
* Tailwind 4 se integra con el loader de Turbopack, **no** con PostCSS.
* `cacheComponents`/`partialPrefetching` están desactivados a propósito: la app
  sirve datos en vivo.
* Lee las guías locales en `node_modules/next/dist/docs/` antes de escribir código.

No sustituyas Tailwind CSS por otro framework de estilos, ni `pg` por un ORM, sin
una justificación explícita.

## 4. Estructura del proyecto

```
src/
  proxy.ts              # Autenticación y redirección previas (equivalente al middleware)
  app/
    layout.tsx          # <html>/<body>, metadatos por defecto y estilos globales
    globals.css
    (site)/             # Sitio público (Header + Footer + "saltar al contenido")
      page.tsx          # /                 portada
      ranking/page.tsx  # /ranking          clasificación en vivo
      alumnos/page.tsx  # /alumnos          portal del alumno
      login/page.tsx    # /login            acceso del profesorado
      competicion/…     # /competicion, /competicion/entrar
    admin/              # Panel docente (protegido): layout + páginas
    api/                # Route Handlers (ver §7 y §10)
  components/           # Componentes (los interactivos llevan 'use client')
  lib/                  # Lógica de negocio y acceso a datos (ver abajo)
  types/index.ts        # Tipos del dominio y de las filas de PostgreSQL
database/migrations/    # Migraciones SQL numeradas 0001–0014 (fuente del esquema)
scripts/                # Migración, comprobación, datos de prueba y smoke E2E
tests/                  # Suites de Vitest sobre la lógica pura
```

Límite **servidor/cliente** en `src/lib/` (respétalo):

* **Solo servidor** (`import 'server-only'`): `db.ts`, `config.ts`,
  `data/postgres.ts`, `data/competition.ts`, `data/maintenance.ts`, `auth/*`.
* **Seguros en cliente**: `data/admin.ts`, `data/ranking.ts`, `format.ts`,
  `ranking.ts`, `codes.ts`, `maintenance.ts`, `competition/draft.ts`,
  `crypto/access-code.ts`, `validation.ts`, `scoring.ts`, `types`.

Los componentes de `src/components/**/*.tsx` llevan `'use client'` cuando
necesitan interactividad; los de `src/components/ui/*.tsx` son de servidor.

## 5. Diseño y experiencia de usuario

La interfaz debe transmitir una experiencia de competición moderna y profesional.

Prioridades:

* Diseño responsive desde móvil hasta escritorio.
* Jerarquía visual clara.
* Tipografía legible.
* Espaciado consistente.
* Colores identificativos para los grupos.
* Tarjetas y paneles con un diseño coherente.
* Animaciones fluidas y discretas; transiciones de clasificación suaves.
* Estados de carga, éxito, error y ausencia de datos.
* Accesibilidad mediante teclado y controles táctiles, contraste suficiente y mensajes comprensibles.

Utiliza Tailwind CSS para mantener la coherencia visual y reutiliza componentes
cuando tenga sentido. Evita efectos visuales excesivos, animaciones que dificulten
la lectura y cambios innecesarios en estilos globales.

## 6. Reglas de negocio inmutables

### Alumnos y grupos

* Cada alumno puede pertenecer a un único grupo.
* Una asignación confirmada queda bloqueada.
* La pertenencia al grupo debe verificarse en el servidor.
* La base de datos debe impedir asignaciones incompatibles o duplicadas.
* La interfaz debe reflejar los datos confirmados por el servidor.
* Las correcciones excepcionales de asignaciones requieren autorización,
  confirmación y auditoría, salvo que la configuración establezca que las
  asignaciones son absolutamente inmutables.

### Ejercicios y puntuación (juego de códigos, `kind = 'code'`)

* Cada ejercicio tiene un código secreto.
* La puntuación por ejercicio es de **100 puntos** por defecto (`exercises.points`);
  se fija en la base de datos y se conserva el valor otorgado en cada resolución.
* Los puntos se conceden **exclusivamente** tras validar correctamente el código.
* Un ejercicio solo puede otorgar puntos **una vez por grupo** (restricción
  `UNIQUE` sobre `submissions`).
* Los envíos incorrectos no alteran la puntuación.
* Las puntuaciones se calculan y registran en el servidor.
* El cliente no puede elegir libremente el grupo beneficiario ni la cantidad de puntos.
* Todas las resoluciones válidas deben quedar registradas de forma auditable.
* La validación y la puntuación deben ser **atómicas** y resistentes a peticiones
  simultáneas (se aplican en la base de datos con `submit_exercise_code`).

### Competición CSS por grupos (`kind = 'css'`)

* La unidad de corrección es la **regla CSS**: `(ronda, grupo, ejercicio, selector,
  propiedad)`. La misma propiedad y valor puede puntuar por separado en selectores
  distintos, pero **nunca dos veces en el mismo selector**.
* **Crédito parcial**: cada propiedad correcta suma `css_points_per_property`
  (10 puntos por defecto).
* **Penalización configurable** (`penalty_enabled`, `penalty_points`,
  `penalty_mode` = `per_property` | `per_submission`, `allow_negative_score`),
  aplicada en el servidor y solo sobre propiedades reconocidas de un selector
  autorizado. Las entregas no evaluables no penalizan.
* **Aislamiento por competición**: cada ronda empieza a 0 para todos los grupos;
  los aciertos y penalizaciones de una ronda no se arrastran a la siguiente. El
  histórico se conserva.
* **Idempotencia**: las entregas se registran en `css_submission_requests` con un
  `requestId` (UUID); un reintento de red no vuelve a puntuar ni a penalizar.
* **Bonificación por velocidad** opcional (`css_speed_bonus_points`/`_seconds`).
* La evaluación real ocurre en la base de datos (`submit_css_selector`,
  `round_ranking`, `recompute_group_scores`).

No implementes estas reglas únicamente mediante validaciones de interfaz.

## 7. Seguridad

* `/admin` y `/api/admin/*` requieren sesión de administrador; `/competicion` y
  `/api/competicion/*` requieren sesión de grupo. La autorización se resuelve en
  `src/proxy.ts`, **en el servidor**, antes de llegar a páginas y handlers.
* La identidad verificada se propaga con los encabezados internos `x-user-id` /
  `x-group-id`. El proxy **borra siempre** los que envíe el cliente. Léelos con
  `getRequestUserId()` / `getRequestGroupId()`; nunca vuelvas a leer la cookie ni
  confíes en datos del cliente.
* Cookies de sesión: `aula_session` (admin, 7 días) y `competicion_session`
  (grupo, 6 horas); `HttpOnly`, `SameSite=Lax` y `Secure` en producción. El token
  se guarda **hasheado** (SHA-256) en la base de datos.
* Comprobación de mismo origen en métodos que cambian estado (defensa CSRF).
* Nunca expongas `DATABASE_URL`, `ACCESS_CODE_ENC_KEY` ni contraseñas al navegador.
  Solo las variables `NEXT_PUBLIC_*` llegan al cliente.
* Valida y normaliza las entradas con Zod **en el servidor**.
* Usa **consultas parametrizadas** (`$1`, `$2`, …) y conserva las transacciones de
  las operaciones atómicas.
* Nunca incluyas los códigos secretos (ejercicio y acceso de grupo) en HTML,
  JavaScript público ni mensajes de error.
* No almacenes secretos en el repositorio: usa `.env` (ignorado por git) y
  documenta con `.env.example`, sin valores reales.
* En producción usa **TLS** con PostgreSQL (`sslmode=require`/`verify-full`); no
  desactives la verificación de certificados.
* El panel docente se marca como no indexable (`robots: noindex, nofollow`).

## 8. Persistencia y tiempo real

* **PostgreSQL es la fuente de verdad compartida**; no uses variables locales como
  fuente definitiva de puntuaciones.
* Acceso centralizado mediante un único `pg.Pool` en `src/lib/db.ts`, creado desde
  `DATABASE_URL` (solo servidor) y reutilizado. Devuelve `null` si no está
  configurado.
* El esquema se define en `database/migrations/` (0001–0014). **No edites una
  migración ya aplicada**: añade una nueva.
* El ranking público se obtiene por **sondeo periódico** de `GET /api/ranking` (hay
  una costura preparada para evolucionar a SSE/WebSocket). No hay Supabase ni
  Realtime.
* El ranking se ordena de mayor a menor puntuación (desempate por antigüedad del
  marcador).
* Los borradores de CSS en `localStorage` son solo comodidad de UX: **nunca**
  otorgan puntos ni cuentan como entrega válida.
* Si falta `DATABASE_URL`, la app muestra un estado de configuración pendiente
  (`ConfigNotice`) y los endpoints devuelven **503**; los accesos redirigen con
  `?reason=config`. **Nunca** presentes datos simulados como si fueran reales.

## 9. Arquitectura y calidad del código

Organiza el código según sus responsabilidades, respetando la estructura existente.
Mantén separadas estas áreas:

* Páginas y layouts de Next.js (App Router) y grupos de rutas (`(site)`, `admin`).
* Componentes interactivos de React (cliente).
* Componentes visuales compartidos (`components/ui`).
* Acceso a datos y a PostgreSQL (`lib/data`, `lib/db.ts`).
* Autenticación y autorización (`proxy.ts`, `lib/auth`).
* Validación de códigos y de formularios (`lib/validation.ts`, `lib/codes.ts`).
* Gestión de grupos y asignaciones.
* Sistema de puntuación (`lib/scoring.ts`, funciones SQL).
* Importación y análisis de CSS (`lib/css/*`).
* Tipos del dominio (`types/index.ts`).
* Migraciones de base de datos (`database/migrations`).

Convenciones:

* **Server Components por defecto**; añade `'use client'` solo cuando haga falta
  interactividad.
* Route Handlers en `src/app/api/**/route.ts`.
* Marca los módulos exclusivos de servidor con `import 'server-only'`.
* Valida con Zod antes de tocar la base de datos.

Evita:

* Componentes monolíticos.
* Lógica de negocio dentro de componentes puramente visuales.
* Consultas duplicadas.
* Manipulación insegura de datos.
* Código sin utilizar y dependencias innecesarias.
* Supresión indiscriminada de errores de TypeScript.
* Funcionalidades que solo aparenten funcionar mediante datos ficticios.

## 10. Pruebas y verificación

Después de cambios relevantes, ejecuta en este orden:

1. `npm run typecheck` (`tsc --noEmit`).
2. `npm run lint` (`eslint`).
3. `npm test` (Vitest; hoy 9 suites / 150 pruebas sobre la lógica pura).
4. `npm run build` (`next build`).
5. Si hay base de datos disponible: `npm run db:check` (conexión + esquema, **solo
   lectura**).
6. Opcional, con servidor en marcha: `npm run db:smoke` (smoke E2E; usa datos de
   prueba).

Comprueba que no se ha roto funcionalidad existente y verifica a mano los casos
críticos: envíos simultáneos y duplicados, permisos administrativos, asignaciones,
integridad del ranking y comportamiento responsive.

**No afirmes que una prueba se ha ejecutado correctamente si no se ha ejecutado
realmente.**

## 11. Configuración y scripts

Variables de entorno (`.env`, ignorado por git; plantilla en `.env.example`):

| Variable | Ámbito | Uso |
| --- | --- | --- |
| `DATABASE_URL` | servidor | Conexión a PostgreSQL |
| `POSTGRES_PASSWORD` | docker | Contraseña del contenedor local (`db:up`) |
| `NEXT_PUBLIC_COMPETITION_NAME` | público | Nombre visible de la competición |
| `ACCESS_CODE_ENC_KEY` | servidor | Clave AES-256-GCM (32 bytes) para cifrar los códigos de acceso |
| `COOKIE_SECURE` | servidor | Fuerza la marca `Secure` de las cookies (`true`/`false`). Vacío: se decide según el esquema de la petición (permite HTTP sin TLS) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | servidor | Administrador inicial (`db:seed-admin`) |
| `APP_URL` | scripts | URL base para `db:smoke` (por defecto `http://localhost:3000`) |

Scripts disponibles en `package.json`:

| Script | Acción |
| --- | --- |
| `dev` / `build` / `start` | Servidor de desarrollo / compilación / producción (puerto 3000) |
| `lint` / `typecheck` / `test` | ESLint / TypeScript / Vitest |
| `db:up` / `db:down` | Levantar / parar PostgreSQL local (Docker) |
| `db:migrate` | Aplicar migraciones pendientes |
| `db:check` | Verificar conexión y esquema (solo lectura) |
| `db:seed-admin` | Crear el administrador inicial |
| `db:smoke` | Smoke test E2E contra la app en marcha |
| `db:penalty`, `db:competition`, `db:delete`, `db:purge` | Pruebas funcionales que **escriben** en la base de datos |

Next.js carga `.env` automáticamente; los scripts de `scripts/` lo cargan con
`process.loadEnvFile`. Los scripts `db:*` (salvo `db:check`) pueden **escribir**:
no los ejecutes sobre datos reales sin autorización.

## 12. Forma de trabajo del agente

* Analiza antes de implementar; **no des nada por supuesto**.
* Presenta un plan breve cuando la tarea implique varios componentes o cambios estructurales.
* Implementa en fases pequeñas y verificables.
* Reutiliza los componentes y las dependencias existentes.
* No modifiques archivos no relacionados con la tarea.
* Explica las decisiones arquitectónicas relevantes.
* Si necesitas credenciales o configuración externa, identifica exactamente qué falta.
* Continúa con las partes independientes de esa configuración cuando sea posible.
* Documenta los pasos manuales pendientes y lo que no hayas podido verificar.
* Mantén la documentación sincronizada con el código.

## 13. Criterio de finalización

Una funcionalidad solo se considera terminada cuando:

* Está implementada.
* Respeta las reglas de negocio.
* Persiste correctamente los datos cuando corresponda.
* Aplica los permisos necesarios.
* Se integra con el resto de la aplicación.
* Se adapta a diferentes tamaños de pantalla.
* Se han ejecutado las comprobaciones pertinentes.
* Se han documentado las limitaciones y los requisitos de configuración pendientes.

**Prioridad absoluta:** integridad de los datos, seguridad, experiencia de usuario
y mantenibilidad.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
