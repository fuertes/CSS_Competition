# Auditoría Fase 0 — Integración de *Dungeon Coder: La Oca del Caos*

> Documento de auditoría y diseño. **No modifica el comportamiento de la
> aplicación** ni la base de datos. Basado en el código real del repositorio
> `css-competition` (rama con commit `69eef32`, árbol de trabajo limpio).
>
> Fecha de la auditoría: 2026-10-16.

---

## 0. Estado del repositorio y cambios pendientes

- `git status` **limpio**. La funcionalidad reciente de "rutas relativas" ya está
  confirmada en `707c356` ("ADD - Rutas relativas") y fusionada en `69eef32`.
  No hay cambios pendientes que preservar ni trabajo a medias en el árbol.
- **No se ha tocado la base de datos** ni se han ejecutado migraciones ni scripts
  `db:*` que escriban.
- No existe en el repositorio (ni en `../ESCAPE_ROOM` / `../Personal`) ningún
  documento de diseño de *Dungeon Coder: La Oca del Caos*. **Se declara
  expresamente como material ausente** y no se inventará su contenido (§12).

---

## 1. Mapa de la arquitectura actual

### 1.1 Stack real (verificado en `package.json`)

| Área | Tecnología |
| --- | --- |
| Framework | Next.js **16.4.0** (App Router, Turbopack por defecto) |
| UI | React **19.3.0** / React DOM **19.3.0** |
| Lenguaje | TypeScript `strict: true`, alias `@/*` → `./src/*` |
| Estilos | Tailwind CSS **4** (loader de Turbopack, no PostCSS) |
| Base de datos | PostgreSQL con **`pg`** (node-postgres), **sin ORM** |
| Validación | **Zod 4** |
| Arrastrar y soltar | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| Análisis CSS | `postcss`, `postcss-selector-parser`, `postcss-value-parser` |
| Pruebas | Vitest **5** (`vitest run`) |
| Lint | ESLint 9 (`eslint-config-next`) |
| Aislamiento servidor | `server-only` |
| Runtime | Node.js ≥ 22.12.0 |

### 1.2 Estructura

```
src/
  proxy.ts              # Antiguo middleware: autenticación/autorización previas
  app/
    layout.tsx          # <html>/<body>, metadatos, estilos globales
    (site)/             # Sitio público (Header + Footer): /, /ranking, /alumnos,
                        #   /login, /competicion, /competicion/entrar
    admin/              # Panel docente protegido: layout + páginas
    api/                # Route Handlers (auth, admin/*, competicion/*, ranking, submit-code)
  components/           # Componentes; interactivos con 'use client'
  lib/                  # Lógica de negocio y acceso a datos
  types/index.ts        # Tipos de dominio y de filas PostgreSQL
database/migrations/    # 0001–0014 (fuente del esquema)
scripts/                # migrate, check-db, create-admin, e2e-smoke, test-*
tests/                  # Suites de Vitest sobre lógica pura
```

### 1.3 Patrones arquitectónicos observados

- **App Router** con grupos de rutas `(site)` y `admin`.
- **Server Components por defecto**; `'use client'` solo en componentes
  interactivos. Los de `src/components/ui/*` son de servidor.
- **Route Handlers** en `src/app/api/**/route.ts`. **No hay Server Actions**
  (grep de `use server`: 0 coincidencias).
- **Lógica de negocio crítica en SQL** (funciones `security definer`), no en JS:
  puntuación y persistencia atómicas.
- **Capa de datos** en `src/lib/data/*` con separación servidor/cliente explícita:
  - Solo servidor (`import 'server-only'`): `db.ts`, `config.ts`,
    `data/postgres.ts`, `data/competition.ts`, `data/maintenance.ts`, `auth/*`.
  - Seguros en cliente: `data/admin.ts`, `data/ranking.ts`, `format.ts`,
    `ranking.ts`, `codes.ts`, `maintenance.ts`, `competition/draft.ts`,
    `crypto/access-code.ts`, `validation.ts`, `scoring.ts`, `types`.
- **Autenticación en dos capas**: `proxy.ts` valida en el borde y propaga
  identidad por cabeceras internas `x-user-id` / `x-group-id`; las páginas y
  handlers la leen con `getRequestUserId()` / `getRequestGroupId()` y **nunca**
  vuelven a leer la cookie.

### 1.4 Autenticación y autorización (`src/proxy.ts`)

- **Sesión de administrador**: cookie `aula_session` (7 días).
- **Sesión de grupo**: cookie `competicion_session` (6 horas).
- El token se guarda **hasheado (SHA-256)** en BD.
- El proxy **elimina siempre** las cabeceras `x-user-id` / `x-group-id` entrantes
  (`src/proxy.ts:82-84`).
- `matcher` (`src/proxy.ts:124-131`):
  `/admin/:path*`, `/api/admin/:path*`, `/competicion/:path*`,
  `/api/competicion/:path*`.
- **Excepciones públicas**: `/competicion/entrar` (página) y
  `/api/competicion/entrar` (API).
- **CSRF**: comprobación de mismo origen en métodos mutantes
  (`MUTATING_METHODS`) mediante `getRequestHost`
  (`src/proxy.ts:62-72`, `src/lib/request-origin.ts`).
- **Redirecciones**: el flujo de autenticación usa **rutas relativas**
  (`relativeRedirect` en `src/lib/http.ts`) en los Route Handlers; el proxy usa
  `new URL(path, request.url)`, que Next relativiza al salir. No hay
  `localhost`/IP codificados en `src/` (grep: 0 coincidencias).

---

## 2. Flujo real de CSS Competition (de extremo a extremo)

1. **Creación de ejercicios**: el docente crea ejercicios. `exercises.kind`
   distingue `'code'` (juego de códigos) y `'css'`
   (`0005_css_competition.sql:53-54`). Para CSS se importan selectores y reglas
   (`exercise_selectors`, `selector_rules`) con el importador
   (`src/lib/css/*`).
2. **Inicio de ronda / competición**: `start_competition_round`
   (`0005:590-635`). Existe **una única ronda abierta** a la vez
   (índice `competition_rounds_single_open`, `0005:166-167`). `competition_rounds`
   es de hecho la **instancia de competición vigente**.
3. **Participantes**: al crear una ronda, un trigger
   (`on_competition_round_created`, `0012:64-83`) añade **todos los grupos
   activos** a `competition_participants`.
4. **Acceso de grupo**: `/competicion/entrar` → `POST /api/competicion/entrar`
   → `group_login` (código de acceso, `0005:272`). Crea sesión de grupo.
5. **Envío CSS**: el grupo envía selector + propiedades →
   `POST /api/competicion/entregar` → **`submit_css_selector`** (función SQL
   atómica, versión vigente en `0011`/`0012`).
6. **Puntuación** (en SQL, servidor):
   - **Crédito parcial**: `css_points_per_property` (10 por defecto,
     `0009:15-17`).
   - **Penalización** configurable (`penalty_*`, `0008:27-32`), solo sobre
     propiedades reconocidas de un selector autorizado.
   - **Bonificación por velocidad** (`css_speed_bonus_*`, `0005:173-181`).
   - **Idempotencia**: `css_submission_requests` con `requestId` UUID
     (`0008:76-84`): un reintento no vuelve a puntuar ni a penalizar.
   - **Aislamiento por ronda**: cada ronda arranca a 0; el histórico se conserva
     (`0011_css_competition_isolation.sql`).
7. **Agregación y ranking**: trigger `on_scoring_event_created` mantiene
   `group_scores`; el ranking de ronda lo calcula **`round_ranking(p_round_id)`**
   (`0011:143`). El público lo consume por **sondeo** de `GET /api/ranking`.
8. **Cierre**: `end_competition_round` (`0005:638-668`). Borrado de una ronda con
   `delete_competition_round` (`0013:97`) y recálculo con
   `recompute_group_scores` (`0013:46`).
9. **Permisos**: `isProtectedPage`/`isAdminApi` (admin) y
   `isCompetitionPage`/`isCompetitionApi` (grupo) en `proxy.ts`.
10. **Pruebas**: 12 suites / 161 pruebas sobre lógica pura (§9).

**Separación clave**: lo **compartido** es grupos, sesiones, ajustes generales y
ranking (infraestructura). Lo **específico de CSS** es `competition_rounds`,
`exercise_selectors`, `selector_rules`, `group_property_scores`, `scoring_events`
CSS, `group_selector_bonuses`, `css_submission_requests` y las funciones
`submit_css_selector` / `round_ranking` / `start_competition_round`.

---

## 3. Resumen de la base de datos y entidades

Acceso: **SQL directo con `pg`** (`src/lib/db.ts`, Pool desde `DATABASE_URL`).
**Sin ORM.** Esquema en `database/migrations/0001–0014` (no se edita una
migración aplicada; se añade una nueva).

### 3.1 Tablas

**Núcleo compartido (0001):**
- `app_secrets` (clave/valor; pepper de códigos).
- `admin_users` (id, email, password_hash, display_name, role).
- `admin_sessions` (tokens de admin hasheados).
- `groups` (id, name único, color, active).
- `students` (id, name, access_code_lookup/hash, `group_id` FK → groups,
  `assignment_locked`, active). **Un alumno pertenece a un solo grupo.**
- `exercises` (id, title, description, code_lookup/code_hash, code_set,
  `points` default 100, active, archived, **`kind` in ('code','css')**).
- `submissions` (student_id, group_id, exercise_id, awarded_points;
  **UNIQUE(group_id, exercise_id)** → una resolución por grupo/ejercicio).
- `group_scores` (agregado por grupo: total_points, solved_count, last_scored_at).
- `submission_attempts` (auditoría de intentos).
- `audit_log` (auditoría administrativa).
- `competition_settings` (**fila única**, `id boolean PK`): ajustes generales y
  de CSS (name, default_points, locks, `css_points_per_property`,
  `penalty_*`, `css_speed_bonus_*`).

**CSS (0005+):**
- `group_sessions`, `group_login_attempts` (sesión y throttling de grupo).
- `exercise_selectors`, `selector_rules` (contenido CSS del ejercicio).
- `group_property_scores`, `group_attempts`, `scoring_events`,
  `group_selector_bonuses` (puntuación e idempotencia).
- `competition_rounds` (instancia de competición; `exercise_id` FK **not null**;
  una sola abierta).
- `competition_participants` (round_id, group_id) — 0012.
- `css_submission_requests` (idempotencia por `requestId`) — 0008.

### 3.2 Funciones/triggers relevantes

`hash_lookup`, `is_admin_user`, `write_audit`, `on_group_created`,
`on_submission_created`, `set_exercise_code`, `set_student_access_code`,
`confirm_assignment`, `correct_assignment`, `clear_assignment`,
`submit_exercise_code`, `student_portal`, `generate_group_access_code`,
`group_login`, `submit_css_selector`, `start_competition_round`,
`end_competition_round`, `round_ranking`, `recompute_group_scores`,
`delete_competition_round`, `purge_entities`.

### 3.3 Conclusión de modelado

**No existe una tabla genérica `competitions`.** La "competición" se representa
por la **ronda abierta** (`competition_rounds`), que es **específica de CSS**
(exige `exercise_id`). El único discriminador de modo existente es
`exercises.kind`. `competition_settings` es un singleton compartido.

---

## 4. Componentes y servicios reutilizables

- **Entidades**: `groups`, `students`, `admin_users`, `audit_log`,
  `competition_settings` (ajustes generales).
- **Autenticación**: `proxy.ts`, `lib/auth/*` (sesión admin + grupo),
  `lib/request-origin.ts`, `lib/crypto/access-code.ts`, `lib/codes.ts`.
- **Acceso a datos**: `lib/db.ts`, `lib/config.ts`, `lib/data/postgres.ts`.
- **UI/estilos**: `components/ui/*`, `AdminUI`, `Header`, `Footer`, `AdminNav`,
  tokens de Tailwind (`globals.css`), tarjetas/paneles, colores por grupo.
- **Panel admin**: `GroupsManager`, `StudentsManager`, `AssignmentsBoard`,
  `ExercisesManager`, `CssExerciseManager`, `CssImporter`, `CompetitionsManager`,
  `ScoresPanel`, `SettingsPanel`, `DataMaintenancePanel`.
- **Utilidades**: `lib/validation.ts` (Zod), `lib/format.ts`, `lib/http.ts`,
  `lib/ranking.ts`, `lib/scoring.ts`, `types/index.ts`.
- **Herramientas**: `scripts/*`, `tests/*`, `npm run typecheck|lint|test|build|db:check`.

---

## 5. Puntos de integración para La Oca del Caos

1. **Identidad y sesiones**: reutilizar `aula_session` (admin) y
   `competicion_session` (grupo) + cabeceras `x-user-id`/`x-group-id`. **No** crear
   un segundo sistema de autenticación.
2. **Grupos y alumnos**: reutilizar `groups` y `students` tal cual. **No** crear
   tablas paralelas.
3. **Rutas**: nuevas áreas claramente separadas y protegidas:
   - Grupo: `/oca` (y subrutas) + `/api/oca/*`.
   - Docente: `/admin/oca` + `/api/admin/oca/*`.
   - Requiere **ampliar el `matcher` y las guardas del `proxy`** para `/oca/**`,
     `/api/oca/**` y `/admin/oca/**`.
4. **Persistencia**: nuevas tablas propias `oca_*` con FK a `groups` (y a
   `admin_users` donde aplique). **Sin** sobrecargar `competition_rounds` ni
   tocar el esquema CSS.
5. **Ajustes**: preferir un **singleton propio `oca_settings`** antes que añadir
   columnas al `competition_settings` de CSS (evita acoplar modos).
6. **UI**: reutilizar `components/ui/*`, `Header`/`Footer`, `AdminNav` y tokens
   Tailwind; añadir entradas de navegación separadas.
7. **Puntuación**: los cristales/posiciones de La Oca **nunca** deben escribir en
   `group_scores`, `scoring_events` ni `submissions`. Rankings separados.
8. **Motor**: lógica pura en `src/lib/oca/*` (tablero, tiradas, reglas) +
   funciones SQL `security definer` para las mutaciones atómicas (turnos,
   recompensas no duplicables, concurrencia).

---

## 6. Riesgos y posibles regresiones

| Riesgo | Detalle | Mitigación |
| --- | --- | --- |
| Instancia de competición única | `competition_rounds_single_open` impone una sola ronda. "Ampliar" esa tabla para dos modos acopla CSS y Oca. | **No** reutilizar `competition_rounds`; crear entidad de partida propia. |
| `competition_settings` singleton | Compartida con CSS; añadir columnas de Oca induce acoplamiento y migraciones sobre datos vivos. | Crear `oca_settings` (o tabla de config de partida). |
| `exercises.kind` | Ampliarlo a `'oca'` forzaría a `exercises` (códigos/CSS) a modelar retos de tablero con otra forma. | Mantener `oca_challenges` como tabla propia. |
| `proxy.ts` | Cambios en `matcher`/guardas pueden proteger de más o exponer rutas. | Añadir guardas explícitas y probar rutas públicas/protegidas. |
| Ranking | Mezclar puntuación Oca con `group_scores` rompería la clasificación CSS. | Ranking y agregados exclusivos de Oca. |
| Purgado (`purge_entities`) | 0014 enumera entidades borrables; podría incluir o no las de Oca. | Decidir explícitamente; no cambiar su comportamiento actual. |
| Migraciones | No editar 0001–0014 aplicadas. | Nueva migración 0015+. |
| Despliegue | Guía EC2 usa Node 20 y `.env.local`, pero `engines.node` exige ≥22.12.0 y los scripts solo cargan `.env`. | Documentar/ajustar sin romper lo actual. |

**Regresión CSS**: ninguna ruta, tabla, función ni puntuación CSS se modifica en
Fase 0 ni debería modificarse en las siguientes fases.

---

## 7. Propuesta de arquitectura para La Oca

```
Núcleo de plataforma (compartido, ya existe)
  groups · students · admin_users · sesiones (admin y grupo) · audit_log · Tailwind · proxy

CSS Competition (intacto)            La Oca del Caos (nuevo módulo aislado)
  competition_rounds                   oca_games              (partida)
  selector_rules / group_property_scores  oca_game_participants (grupos en la partida)
  submit_css_selector / round_ranking  oca_board_squares      (40 casillas, zonas)
                                       oca_pieces / oca_positions
                                       oca_turns / oca_moves  (historial de tiradas)
                                       oca_challenges / oca_attempts
                                       oca_cards / oca_inventory
                                       oca_traps / oca_effects
                                       oca_events / oca_settings
```

- **Partida de Oca** = `oca_games` (estado, configuración, condición de victoria),
  ligada a un conjunto de `groups` participantes vía `oca_game_participants`.
- **Tablero**: 40 casillas con zonas temáticas (modelo de datos o constante
  versionada).
- **Turnos/movimiento**: calculados **en el servidor**; historial en `oca_moves`.
- **Retos/cristales/cartas/trampas**: tablas propias; recompensas **una sola vez**
  (restricciones UNIQUE + transacciones).
- **Motor puro** en `src/lib/oca/*` + **RPC SQL** para mutaciones atómicas.
- **UIs separadas**: `/oca` (grupo) y `/admin/oca` (docente).

### Compatibilidad con los datos y discriminación de modo

No se introduce una entidad "competición" común que haya que reconciliar:
La Oca vive en su propio espacio de tablas y **reutiliza solo `groups`**. Así se
conserva el histórico CSS y no hay efectos secundarios. Si en el futuro se desea
un selector unificado, se haría en la capa de presentación (una "sala/modo" que
apunta a una ronda CSS **o** a una partida de Oca), nunca fusionando tablas.

---

## 8. Plan de fases ajustado

- **Fase 0 — Auditoría y diseño** (esta entrega). Sin cambios funcionales ni de BD.
- **Fase 1 — Preparación de la integración**: esqueleto del módulo `src/lib/oca/*`,
  área `/oca` y `/admin/oca` (punto de entrada visual **separado**, sin mecánicas),
  ampliación del `proxy` y de la navegación. **Sin tablas todavía.**
- **Fase 2 — Asociación con grupos**: entidad de partida + participantes
  (reutilizando `groups`), permisos y aislamiento. Sin cartas ni recompensas.
- **Fase 3 — Tablero y estado persistente**: 40 casillas, zonas, posiciones.
- **Fase 4 — Turnos y movimiento**: tirada en servidor, historial, fin de turno,
  concurrencia y límites.
- **Fase 5 — Retos y cristales**: dificultad, validación en servidor, recompensa
  única, reto final.
- **Fase 6 — Cartas e inventario**.
- **Fase 7 — Trampas y efectos** (duración/expiración, sin bloqueos permanentes).
- **Fase 8 — Victoria y administración** (fin de partida, clasificación, config
  docente, reinicio seguro).
- **Fase 9 — Consolidación** (regresión, build, seguridad, `localhost`, responsive,
  accesibilidad, docs, EC2).

Cada fase: objetivo → archivos → comportamiento → criterios de aceptación →
implementación → pruebas → typecheck/lint/build → verificar CSS intacto →
documentar. **No se avanza sin aprobación.**

---

## 9. Pruebas de regresión que deben mantenerse

Estado actual verificado: **12 archivos / 161 pruebas**, `npm test` en verde. Se
deben mantener y ejecutar en cada fase:

- Lógica pura de puntuación CSS (`lib/scoring.ts`), ranking (`lib/ranking.ts`),
  códigos (`lib/codes.ts`), validación (`lib/validation.ts`), borradores
  (`competition/draft.ts`), mantenimiento (`maintenance.ts`), `crypto/access-code`,
  `relative-redirect`, `request-origin`.
- Comprobaciones del proyecto: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`.
- Con BD disponible (solo lectura): `npm run db:check`. `db:smoke` escribe: no
  ejecutar sobre datos reales sin autorización.

---

## 10. Primera modificación de código propuesta (Fase 1)

**Objetivo**: dejar preparado el módulo de La Oca con un **punto de entrada visual
separado**, sin implementar tablero, sin tocar la base de datos y sin alterar CSS.

Alcance concreto:

1. Crear el esqueleto `src/lib/oca/` (constantes del tablero de 40 casillas, tipos
   y utilidades puras; sin persistencia).
2. Nueva página de grupo `/oca` (protegida por sesión de grupo, siguiendo el
   patrón de `(site)`) con un placeholder claro de "próximamente" y enlace a CSS.
3. Nueva página docente `/admin/oca` (protegida por sesión de admin) con estado
   "no configurado".
4. Ampliar `proxy.ts`: `matcher` + guardas para `/oca/**`, `/api/oca/**`,
   `/admin/oca/**`.
5. Añadir accesos en la navegación (`Header`, `AdminNav`) **sin** alterar los
   existentes.
6. Documentación: esta auditoría + nota de integración en `README`/`AGENTS`.

**Criterios de aceptación**: CSS Competition sigue funcionando igual; las rutas
nuevas están protegidas correctamente; typecheck/lint/test/build en verde; sin
cambios de esquema.

---

## 11. Archivos previstos para la Fase 1

- `src/proxy.ts` (matcher + guardas).
- `src/app/(site)/oca/page.tsx` (nuevo).
- `src/app/admin/oca/page.tsx` (nuevo).
- `src/lib/oca/board.ts` y `src/lib/oca/types.ts` (nuevos; puros).
- `src/components/Header.tsx` (acceso de navegación).
- `src/components/admin/AdminNav.tsx` (acceso de navegación).
- `docs/` (esta auditoría), `README.md`, `AGENTS.md` (documentación).
- Posible: `src/app/api/oca/estado/route.ts` (placeholder de solo lectura), a
  decidir.

*Sin migraciones de base de datos en Fase 1.*

---

## 12. Dudas funcionales a resolver antes de continuar

El **documento funcional de La Oca no está disponible**. Preguntas abiertas:

1. ¿Se dispone del documento original de diseño? Sin él, no se implementarán
   reglas inventadas.
2. ¿Una clase = **una** partida, o pueden coexistir varias partidas/grupos?
3. ¿Se reutiliza el **código de acceso de grupo** existente para entrar en `/oca`?
4. ¿Cuántos grupos juegan por partida y cómo se decide el orden de turno?
5. Tablero: ¿40 casillas fijas? ¿Zonas temáticas exactas y tipos de casilla?
6. Retos: niveles, validación (opción múltiple, código, CSS…), y si reutilizan
   `exercises`/`submissions` o son propios.
7. Cristales: economía (obtención, gasto), y si afectan a la puntuación/clasificación
   de La Oca (nunca a CSS).
8. Cartas: mazo, efectos, inventario, compras.
9. Trampas: quién las coloca, efectos, duración, exposición.
10. Victoria y desempate; reinicio seguro de partida y conservación de histórico.
11. Configuración docente mínima (parámetros) y dónde se edita.
12. ¿La clasificación de La Oca es independiente de la de CSS? (Se asume que sí.)
13. Turnos: ¿estrictamente secuenciales o con límite de tiempo?
14. ¿Requiere tiempo real (SSE/WebSocket) o sondeo como el ranking actual?

---

*Fin de la auditoría Fase 0. Pendiente de aprobación antes de implementar la Fase 1.*
