# CSS Competition — Plataforma educativa de competición por equipos

Aplicación web educativa para gestionar alumnos, asignarlos a grupos, resolver
ejercicios mediante códigos secretos, **corregir CSS en equipo** y mostrar la
clasificación de la competición.

Construida con **Next.js 16** (App Router), **React 19**, **TypeScript**,
**Tailwind CSS** (v4) y **PostgreSQL** local (Docker) con el cliente **`pg`**. El
ranking público se actualiza mediante **sondeo periódico** del endpoint
`/api/ranking` (con una costura preparada para evolucionar a SSE/WebSocket).

> Este proyecto es la **migración a Next.js** del proyecto Astro
> `opposite-orbit`. Consulta [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) y
> [`MIGRATION_REPORT.md`](./MIGRATION_REPORT.md) para ver el alcance y los
> resultados verificados.

---

## ✨ Funcionalidades

- **Página pública de ranking** (`/ranking`): clasificación en tiempo real,
  podio, orden de mayor a menor puntuación (desempate por antigüedad del
  marcador) y animaciones de transición.
- **Portal del alumno** (`/alumnos`): el alumno se identifica con su **código
  de acceso personal** (nunca por nombre). Ve su grupo, historial de
  resoluciones y ejercicios pendientes.
- **Resolución de ejercicios**: se introduce el código de acceso y el **código
  secreto del ejercicio**. La validación y la puntuación ocurren **solo en la
  base de datos** (operación atómica y resistente a envíos duplicados y
  simultáneos).
- **Panel de administración** (`/admin`): grupos, alumnos, asignaciones
  (arrastrar y soltar), ejercicios, puntuaciones, configuración y auditoría.
- **Código único por grupo**: al crear un grupo se le asigna automáticamente un
  código de 5 caracteres que **no puede repetirse** (garantizado por la base de
  datos). Es público para el profesor y se muestra en el panel.
- **Competición CSS por grupos** (`/competicion`): cada grupo entra una sola vez
  con un **código de acceso secreto** (8 caracteres, generado por el servidor y
  entregado por el profesor). Corrige los selectores en una caja de texto y gana
  puntos **por cada regla correcta** (crédito parcial). La unidad de corrección es
  la regla CSS (`ejercicio + selector + propiedad`), de modo que la **misma**
  propiedad y valor puede puntuar por separado en selectores distintos, pero
  nunca dos veces en el mismo selector.
- **Navegación libre entre selectores**: la vista del grupo muestra **todos** los
  selectores del ejercicio con su estado (pendiente / en progreso / completado),
  un indicador de progreso y permite **cambiar de selector sin terminar el
  actual** y **volver a los anteriores**. El borrador de cada selector se
  conserva en el navegador (aunque no se haya enviado) y el selector activo se
  recupera al recargar. Un borrador guardado **nunca** otorga puntos ni cuenta
  como entrega válida: la puntuación solo cambia cuando el servidor evalúa una
  entrega. El estado es agregado por selector y no revela propiedades concretas.
- **Penalización configurable** (`/admin/settings`): el profesor decide si los
  errores de CSS restan puntos, cuántos, en qué **modo** (por cada propiedad
  incorrecta o una vez por entrega con errores) y si el saldo puede quedar por
  debajo de cero. La penalización se aplica en el servidor, solo sobre
  propiedades reconocidas de un selector autorizado, y nunca sobre entregas no
  evaluables (sintaxis inválida, selector ajeno, errores internos o peticiones
  sin sesión). Las entregas son **idempotentes** (un reintento de red no vuelve a
  penalizar).
- **Puntuación aislada por competición**: cada competición (ronda) empieza **a 0**
  para todos los grupos. Los aciertos, penalizaciones y bonificaciones de una
  competición no se arrastran a la siguiente, aunque el grupo conserve su código
  de acceso y su historial. La clasificación de una competición suma solo sus
  propias resoluciones; el **histórico** de competiciones anteriores se conserva y
  se puede consultar. La participación se fija al iniciar cada competición con
  los grupos activos.
- **Panel CSS** (`/admin/css`): el profesor crea ejercicios CSS, sus selectores,
  las reglas privadas (propiedad + valor esperado + puntos) y abre/cierra la
  **ronda** activa.
- **Importador de CSS** (`/admin/css`): el profesor pega un **bloque CSS
  completo** y el servidor lo analiza con PostCSS. Detecta automáticamente los
  selectores (dividiendo las listas agrupadas) y sus propiedades, avisa de
  selectores repetidos, declaraciones duplicadas o sintaxis inválida, y permite
  **revisar y editar** antes de guardar: cambiar el valor esperado, ajustar los
  puntos por propiedad, excluir propiedades, reordenar y eliminar selectores.
  El guardado es **transaccional** y revalida todo en el servidor.
- **Sesiones de administrador** propias: cookie `HttpOnly` + token aleatorio
  cuyo hash se guarda en PostgreSQL (`admin_sessions`).

---

## 🧱 Requisitos

- **Docker** (con Compose) para la base de datos PostgreSQL 17.
- **Node.js ≥ 22.12** y **npm**.

---

## 🚀 Puesta en marcha

1. **Copia la configuración**

   ```bash
   cp .env.example .env
   ```

   Rellena `DATABASE_URL` y `POSTGRES_PASSWORD` (deben coincidir entre sí) y,
   si quieres, las credenciales del primer administrador (`ADMIN_EMAIL`,
   `ADMIN_PASSWORD`).

2. **Instala las dependencias**

   ```bash
   npm install
   ```

3. **Levanta PostgreSQL**

   ```bash
   npm run db:up        # docker compose up -d postgres
   ```

4. **Aplica las migraciones**

   ```bash
   npm run db:migrate   # aplica database/migrations/ y registra en schema_migrations
   ```

5. **Crea el primer administrador**

   ```bash
   npm run db:seed-admin
   ```

6. **Arranca la aplicación**

   ```bash
   npm run dev          # http://localhost:3000
   ```

   Entra en `http://localhost:3000/login` con el administrador creado.

> Si `DATABASE_URL` no está definida, la aplicación sigue funcionando pero
> muestra un **estado de configuración pendiente** en lugar de datos simulados
> (y el panel redirige a la página de configuración).

---

## 🎛️ Variables de entorno

| Variable                     | Uso                                                        |
| ---------------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`               | Conexión a PostgreSQL. **Solo de servidor**, jamás llega al navegador. |
| `POSTGRES_PASSWORD`          | Contraseña usada por `docker-compose` al crear el contenedor. |
| `NEXT_PUBLIC_COMPETITION_NAME` | Nombre visible de la competición (valor público).        |
| `ADMIN_EMAIL`                | Correo del primer administrador (solo `db:seed-admin`).    |
| `ADMIN_PASSWORD`             | Contraseña del primer administrador (solo `db:seed-admin`). |
| `ADMIN_NAME`                 | Nombre mostrado del administrador (opcional).              |
| `ACCESS_CODE_ENC_KEY`        | Clave (32 bytes en base64 o 64 caracteres hex) para cifrar los códigos de acceso de grupo. **Solo de servidor.** Sin ella, los códigos nuevos se generan y verifican igual, pero no pueden volver a mostrarse en el panel. Genera una con `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. |

El archivo `.env.example` contiene valores de ejemplo **no reales**.

---

## 📦 Scripts

```bash
npm run dev            # arranca el servidor de desarrollo (Next.js, puerto 3000)
npm run build          # compila la aplicación (Turbopack, SSR)
npm run start          # sirve la build de producción
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm test               # vitest run

npm run db:up          # levanta el contenedor de PostgreSQL
npm run db:down        # detiene el contenedor (los datos se conservan)
npm run db:migrate     # aplica las migraciones pendientes
npm run db:check       # verifica la conexión, tablas y funciones
npm run db:seed-admin  # crea o actualiza el administrador
npm run db:penalty     # puntuación por selector y penalización contra la base de datos (sin servidor)
npm run db:competition # aislamiento de puntuación por competición (base de datos, sin servidor)
npm run db:delete      # borrado de competiciones (base de datos, sin servidor)
npm run db:purge       # purga masiva de grupos/alumnos (base de datos, sin servidor)
npm run db:smoke       # smoke test end-to-end (el servidor debe estar en marcha)
```

---

## 🗄️ Base de datos

### Migraciones

`database/migrations/` contiene los scripts SQL versionados:

- `0001_init.sql` — esquema completo (grupos, alumnos, ejercicios,
  resoluciones, marcadores, auditoría, sesiones, funciones atómicas y la vista
  `ranking`).
- `0002_assignment_fixes.sql` — `clear_assignment` (desasignación admin).
- `0003_admin_sessions_cleanup.sql` — mantenimiento de sesiones.
- `0004_group_codes.sql` — código único y público por grupo (máx. 5 caracteres:
  columna, generador, restricción `UNIQUE` y trigger).
- `0005_css_competition.sql` — competición CSS: código de acceso secreto por
  grupo (`access_code_lookup`/`access_code_hash`), sesiones de grupo
  (`group_sessions`), selectores y reglas privadas, puntuación por propiedad
  (`group_property_scores`), intentos, eventos de puntuación, bonificaciones,
  rondas (`competition_rounds`, una sola abierta) y las funciones atómicas
  `group_login` y `submit_css_selector`.
- `0006_fix_group_access_code.sql` — corrige la llamada a `get_byte` en el
  generador del código de acceso de grupo.
- `0007_fix_access_code_alphabet.sql` — corrige el alfabeto del generador (32
  símbolos) para que el código de acceso tenga siempre 8 caracteres; antes el
  alfabeto tenía 31 y algunos códigos salían cortos.
- `0008_css_penalty.sql` — penalización configurable e idempotencia: columnas
  `penalty_enabled`, `penalty_points`, `penalty_mode` y `allow_negative_score` en
  `competition_settings`; `scoring_events.points` pasa a ser **con signo** con
  `kind in ('property','speed','penalty')`; auditoría de cada entrega en
  `group_attempts` (`penalty_points`, `net_points`, `new_properties`,
  `request_id`); tabla `css_submission_requests` para reintentos idempotentes; y
  nueva `submit_css_selector` que cobra la penalización y aplica el límite de
  cero.
- `0009_css_scoring_settings.sql` — `competition_settings.css_points_per_property`:
  puntos base por propiedad correcta para las reglas CSS **nuevas** (importador y
  alta manual). Las reglas ya creadas conservan sus puntos.
- `0010_css_selector_scoring.sql` — puntuación **independiente por selector**:
  sustituye la unicidad `(group_id, exercise_id, property_name)` por
  `(group_id, exercise_id, selector_id, property_name)`, añade una clave
  foránea compuesta `(selector_id, exercise_id)` → `exercise_selectors (id, exercise_id)`
  para garantizar que el selector pertenece al ejercicio, y redefine
  `submit_css_selector` para aislar la evaluación y la concesión de puntos por
  selector. Conserva puntuaciones históricas, penalizaciones, bonificaciones e
  idempotencia.
- `0011_css_competition_isolation.sql` — **aislamiento de la puntuación por
  competición**: cada competición (ronda) es un ámbito de puntuación nuevo. Añade
  `round_id` a `scoring_events`, `group_property_scores`, `group_attempts`,
  `group_selector_bonuses` y `css_submission_requests`; el backfill asocia el
  historial existente a su ronda por ventana temporal y ejercicio (y lo deja sin
  ronda cuando no es determinable, sin inventar asociaciones); la unicidad pasa a
  los índices parciales `group_property_scores_round_unique`
  `(round_id, group_id, exercise_id, selector_id, property_name)` y
  `group_selector_bonuses_round_unique` `(round_id, group_id, selector_id)`,
  conservando además el índice histórico `group_property_scores_legacy_unique`
  para las filas sin ronda; y redefine `submit_css_selector` para que todos los
  registros se asocien a la ronda activa, la penalización se limite al saldo de
  **esa** competición, y la bonificación por velocidad se conceda **una vez por
  competición**. Añade la función `round_ranking(round_id)`, que devuelve la
  clasificación sumando solo los eventos de la competición indicada.
- `0012_css_competition_participants.sql` — **participación explícita por
  competición**: añade la tabla `competition_participants (round_id, group_id)`,
  que fija el **roster** de cada ejecución con los grupos activos en el momento
  de iniciarla (disparador `competition_rounds_participants`). El backfill
  inscribe en las rondas existentes solo a los grupos con actividad registrada
  (sin inventar participantes) y a los grupos activos en la ronda abierta. La
  función `submit_css_selector` exige pertenencia a la competición activa, de
  modo que un grupo activo ajeno a esa ejecución tampoco puntúa.
- `0013_admin_competition_delete_and_code_recovery.sql` — **borrado de
  competiciones y código de acceso recuperable**:
  - `groups.access_code_encrypted` guarda el código de acceso cifrado con
    **AES-256-GCM en la aplicación** (clave en `ACCESS_CODE_ENC_KEY`, nunca en la
    base de datos), para poder volver a mostrarlo en el panel. El hash bcrypt y
    el lookup HMAC se conservan intactos para verificar el acceso; los grupos
    existentes quedan sin cifrado (`null`, no se inventa ningún código).
  - `delete_competition_round(round_id, actor_id)`: borrado **real** de una
    competición (ejecución) solo para administradores, que elimina participantes,
    intentos, puntuaciones por propiedad, eventos de puntuación y bonificaciones
    de esa ronda (en cascada), conservando los grupos, sus códigos de acceso y el
    ejercicio compartido. Bloquea la ronda con `FOR UPDATE` (serializa borrados y
    entregas concurrentes) y recalcula el marcador de los grupos afectados.
  - `recompute_group_scores(group_ids[])`: recalcula `group_scores` desde
    `submissions` y `scoring_events`, porque los triggers solo **suman** al
    insertar y no descuentan al borrar (evita puntuaciones huérfanas).
- `0014_admin_bulk_purge.sql` — **mantenimiento de datos (purga masiva)**: la
  función `purge_entities(scope, confirmation, actor_id)` permite borrar **todos
  los grupos** (`groups`), **todos los alumnos** (`students`) o **ambos**
  (`both`) de una vez, solo para administradores y exigiendo la frase de
  confirmación exacta. Calcula los recuentos en el servidor, bloquea
  `groups`/`students`/`submissions` con `ACCESS EXCLUSIVE` (serializa purgas
  simultáneas y bloquea escrituras concurrentes), elimina las resoluciones del
  juego de códigos (`submissions`, con `ON DELETE RESTRICT`), recalcula el
  marcador de los grupos que sobreviven, audita la operación y devuelve los
  recuentos reales. **Conserva** los ejercicios y sus soluciones, las
  competiciones (`competition_rounds`), la configuración y las cuentas de
  administración.

El runner (`scripts/migrate.mjs`) aplica cada migración **dentro de una
transacción**, registra la versión en `schema_migrations` y usa un
`pg_advisory_lock` para impedir ejecuciones simultáneas. Si una migración
falla, se revierte por completo y no queda registrada.

### Reglas de negocio en la base de datos

El marcador se calcula exclusivamente en el servidor dentro de la función
`submit_exercise_code` (SECURITY DEFINER), que:

- identifica al alumno y a su grupo mediante `hash_lookup` (HMAC-SHA256 con
  *pepper*) y verifica con bcrypt,
- aplica el **límite de intentos** (`submission_attempts`),
- comprueba que el código del ejercicio sea correcto,
- concede puntos **una sola vez por grupo y ejercicio** gracias a la
  restricción `UNIQUE (group_id, exercise_id)`, que también cubre los envíos
  simultáneos,
- deja trazabilidad en `submissions`, `submission_attempts` y el marcador del
  grupo (trigger `on_submission_created`).

Las asignaciones se confirman con `confirm_assignment` (bloquea la fila con
`FOR UPDATE` y marca `assignment_locked`). La corrección excepcional de una
asignación confirmada requiere la opción correspondiente en la configuración
(`correct_assignment`, con auditoría y motivo). Todas las acciones
administrativas quedan registradas en `audit_log` con el actor de la sesión.

Cada grupo recibe un **código único de 5 caracteres** (público, no secreto). Lo
genera la base de datos (`generate_group_code` + trigger `groups_assign_code`),
que además lo asigna a los grupos existentes al migrar. La restricción
`UNIQUE (code)` impide duplicados, incluidos los creados simultáneamente.

### Competición CSS

- El **código de acceso secreto** de cada grupo (8 caracteres) se genera por el
  servidor con `gen_random_bytes` (40 bits de entropía) y se guarda **hasheado**
  (lookup HMAC + bcrypt) para verificar el acceso, y además **cifrado** con
  AES-256-GCM (clave en `ACCESS_CODE_ENC_KEY`, fuera de la base de datos) para que
  el profesor pueda **volver a consultarlo y copiarlo** en `/admin/groups`. La
  respuesta del panel nunca expone el hash ni el lookup, y solo es accesible con
  sesión de administrador. Si no hay clave de cifrado, el código se genera y
  verifica igual, pero no puede recuperarse.
- El grupo inicia sesión con `group_login`, que aplica **límite de intentos** y
  crea una sesión propia (`group_sessions`, cookie `HttpOnly`, 6 h). La
  identidad del grupo **siempre** procede de la sesión, nunca del cliente.
- El CSS se analiza en el servidor con **PostCSS**. Solo se admite **una regla**
  con el selector indicado; se rechazan sintaxis inválida, selectores
  adicionales, at-rules, anidamiento, declaraciones duplicadas y entradas
  sobredimensionadas. El selector enviado se compara con el autorizado por su
  **forma canónica** (se admiten los mismos tipos de selector que el
  importador; las diferencias de formato irrelevantes no afectan, pero un
  selector distinto o una lista añadida se rechazan).
- La puntuación ocurre en `submit_css_selector` (SECURITY DEFINER, atómica): la
  unidad es la **regla del selector** (`ejercicio + selector + propiedad`). Se
  conceden puntos **por propiedad correcta** (valor canónico) del selector que se
  está corrigiendo y **una sola vez por grupo, ejercicio, selector y propiedad
  dentro de cada competición** (`round_id`), gracias a
  `UNIQUE (round_id, group_id, exercise_id, selector_id, property_name)`, que
  también resuelve entregas simultáneas. Dos selectores distintos pueden puntuar
  la misma propiedad y valor de forma independiente, y la misma regla puede
  volver a puntuar en otra competición. Los intentos y los eventos quedan
  auditados.
- La **bonificación por velocidad** (configurable) se concede como máximo una
  vez por selector, dentro del umbral, y nunca duplica puntos.
- Las respuestas son **genéricas**: indican si se han obtenido puntos y el
  total, pero **nunca** revelan propiedades correctas ni el valor esperado.

##### Navegación entre selectores

- La vista del grupo recibe **todos** los selectores activos de la ronda, cada
  uno con un **estado agregado** (`pending`, `in_progress`, `completed`) y un
  **progreso** a nivel de selector. El estado se calcula por **selector y
  propiedad** (coherente con la unicidad `(group_id, exercise_id, selector_id, property_name)`),
  de modo que resolver una propiedad en un selector no marca como resuelta esa
  misma propiedad en otro.
- Se puede **cambiar de selector** en cualquier momento (sin terminar el actual)
  y **volver a los anteriores**; el **selector activo** y el **borrador** de cada
  selector se guardan en `localStorage` con claves `css.active.<exerciseId>` y
  `css.draft.<exerciseId>.<selectorId>` (con reserva en memoria si `localStorage`
  no está disponible). Un borrador **no** es una entrega: no puntúa ni penaliza.
- El estado que se muestra **no revela** el número de propiedades ni cuáles son
  correctas. Navegar no altera puntuaciones, intentos, penalizaciones ni la hora
  de activación registrada en el servidor.

##### Penalización configurable

- El profesor configura, en **Sistema de puntuación** (`/admin/settings`):
  `css_points_per_property` (puntos base por propiedad correcta de las reglas
  CSS nuevas), `penalty_enabled`, `penalty_points`, `penalty_mode`
  (`per_property` = descuenta por cada propiedad incorrecta; `per_submission` =
  descuenta una sola vez si la entrega trae al menos un error) y
  `allow_negative_score`.
- La penalización se calcula en `submit_css_selector`, dentro de la **misma
  transacción** que la concesión de puntos, con bloqueo de la fila de
  `group_scores`. Solo penaliza **propiedades reconocidas** del selector
  autorizado cuyo valor difiere del esperado. **No** penaliza:
  - entregas no evaluables (sintaxis inválida, selector ajeno, errores internos),
  - peticiones sin sesión de grupo,
  - propiedades **omitidas** (trabajo incremental) ni propiedades no reconocidas,
  - propiedades **ya puntuadas** (no se re-evalúan ni se penalizan).
- **Límite de saldo**: si `allow_negative_score` es falso, la penalización se
  recorta para no bajar de 0 (`least(deseada, greatest(0, saldo + concedido))`);
  si es verdadero, el saldo puede quedar negativo.
- **Idempotencia**: cada entrega lleva un `requestId` (UUID) del cliente. Se
  reserva en `css_submission_requests` y, ante un reintento con el mismo id, se
  devuelve la **respuesta original** sin volver a puntuar ni penalizar. Un id
  distinto sí se evalúa como entrega nueva. Sin `requestId`, la unicidad de
  `group_property_scores` (por grupo, ejercicio, selector y propiedad) sigue
  impidiendo puntuar dos veces la misma regla.
- Cada entrega queda **auditada** en `group_attempts` (puntos concedidos,
  penalización aplicada y saldo neto) y los eventos distinguen concesiones
  (`kind = 'property' | 'speed'`) de descuentos (`kind = 'penalty'`, puntos
  negativos).

##### Aislamiento por competición

- Cada **ejecución de competición** es una fila de `competition_rounds` (una
  sola abierta a la vez). Al **iniciar** una ronda se abre un **ámbito de
  puntuación nuevo**: los grupos empiezan a 0 aunque tuvieran puntos en
  competiciones anteriores. No se borra ningún grupo, código de acceso ni
  historial.
- La **unidad de puntuación** incluye la competición:
  `group_id + round_id + exercise_id + selector_id + property_name`. Por eso una
  misma regla **puede volver a puntuar** en una competición nueva, pero **nunca
  dos veces dentro de la misma** (índices únicos parciales por `round_id`).
  Penalizaciones y bonificaciones también quedan confinadas a su competición
  (la bonificación por velocidad se concede una vez **por competición**).
- El **marcador de la competición** se calcula con `round_ranking(round_id)`,
  que suma **exclusivamente** los eventos de esa ronda. La vista pública y la
  clasificación de la competición usan esta función mientras hay una competición
  activa; sin competición activa, muestran el **marcador histórico acumulado**
  (`public.ranking`) para consultar resultados anteriores. El panel de
  administración distingue ambas vistas (competición activa vs. histórico).
- El **límite de saldo** de la penalización usa el saldo de **esa** competición
  (no el acumulado histórico), de modo que las penalizaciones no consumen puntos
  de otras competiciones.
- **Idempotencia y concurrencia** se mantienen por competición: un reintento con
  el mismo `requestId` devuelve la respuesta original; una petición **retrasada**
  de una competición anterior no altera el marcador actual; dos entregas
  simultáneas no duplican puntos; una competición **finalizada** no acepta
  entregas.
- **Participación explícita**: al iniciar una competición se inscribe en
  `competition_participants` a los grupos **activos** en ese momento (roster
  fijo). La entrega exige pertenencia a esa ejecución y al grupo **activo**, así
  que un grupo inactivo o un grupo creado/activado después de iniciar la
  competición **no obtiene puntos** en ella (el servidor nunca acepta el
  `competition_id` del cliente).
- **Historial**: la migración `0011` asocia las puntuaciones antiguas a su
  competición por ventana temporal y ejercicio. Si no es determinable, la fila
  queda **sin ronda** (ámbito histórico) y **no** se atribuye a ninguna
  competición; nunca se borran puntuaciones.
- **Alcance**: el juego de **códigos** (`submissions`) es acumulativo e
  histórico, independiente de las rondas CSS; la puntuación aislada por
  competición aplica a la **competición CSS**.

##### Eliminar una competición

- En `Competición CSS` (`/admin/css`) hay una lista de **competiciones**
  (ejecuciones) con su estado (en curso/finalizada), fechas, participantes,
  eventos y propiedades. Cada una tiene un botón **Eliminar competición** con
  doble confirmación que **nombra** la competición y avisa (con más énfasis si
  está en curso) de que los resultados históricos se perderán.
- El borrado es **real y solo en el servidor** (`delete_competition_round`),
  restringido a administradores y con validación del identificador. Elimina en
  cascada participantes, intentos, puntuaciones por propiedad, eventos de
  puntuación (incluidas penalizaciones) y bonificaciones de **esa** ronda, y
  **recalcula** el marcador de los grupos afectados para no dejar puntos
  huérfanos. **Conserva** los grupos, sus códigos de acceso y el ejercicio
  compartido.
- Todo ocurre en una **única transacción**: si algo falla, no queda un borrado a
  medias. La ronda se bloquea con `FOR UPDATE`, de modo que una entrega
  concurrente no puede generar puntos después de iniciarse el borrado (su clave
  foránea falla y toda la entrega se revierte).

##### Mantenimiento de datos (acciones masivas)

En **Mantenimiento** (`/admin/maintenance`) hay tres acciones de peligro para
limpiar datos de prueba antes de migrar las funcionalidades a otro proyecto:

- **Eliminar todos los grupos** (`ELIMINAR TODOS LOS GRUPOS`).
- **Eliminar todos los alumnos** (`ELIMINAR TODOS LOS ALUMNOS`).
- **Vaciar grupos y alumnos** (`VACIAR GRUPOS Y ALUMNOS`), en una sola
  operación atómica.

Cada botón es independiente y abre un diálogo que muestra el **recuento real**
(calculado en el servidor) y exige escribir la frase exacta en mayúsculas; la
acción no se puede deshacer.

- **Solo el servidor.** La página es solo un cliente: los datos se eliminan en la
  función SQL `purge_entities` (migración `0014`), restringida a administradores
  (`is_admin_user`), con validación del ámbito y de la frase, y en una **única
  transacción**. No hay borrados por `GET` (la vista previa es una lectura) y las
  peticiones `POST` exigen mismo origen.
- **Qué se conserva.** Nunca se eliminan los **ejercicios** ni sus **soluciones
  de referencia** (selectores y reglas), las **competiciones**
  (`competition_rounds`), la **configuración** ni las **cuentas de
  administración**. Al eliminar solo grupos, los **alumnos se conservan** (quedan
  sin grupo).
- **Historial inseparable (decisión explícita).** Las puntuaciones por grupo y
  las resoluciones del juego de códigos dependen de la entidad con claves
  foráneas no anulables (`CASCADE`/`RESTRICT`): no pueden sobrevivir sin el grupo
  o el alumno. La operación las elimina con la entidad, lo **avisa** en el
  diálogo con el recuento antes de confirmar, y **recalcula** el marcador de los
  grupos que siguen existiendo para no dejar puntos huérfanos. Conservar esos
  resultados exigiría cambiar el modelo de datos (hacer anulables las claves
  foráneas y guardar una copia del nombre); queda fuera del alcance y documentado
  como limitación.
- **Concurrencia e integridad.** El bloqueo `ACCESS EXCLUSIVE` de
  `groups`/`students`/`submissions` serializa purgas simultáneas y bloquea
  entregas concurrentes (sus claves foráneas quedan en espera), de modo que dos
  operaciones masivas nunca dejan el estado a medias. Las solicitudes repetidas
  son seguras (devuelven 0 eliminados).

#### Importador de CSS de referencia

El profesor puede pegar un bloque CSS completo en **Importar CSS**; el análisis
se hace en el servidor con PostCSS (nunca con expresiones regulares):

- **Selectores completos.** Admite etiquetas, `#id`, `.clase`, descendientes,
  combinadores `>` `+` `~`, selectores combinados, atributos, pseudoclases,
  pseudoelementos, funciones `:is()`, `:where()`, `:not()`, `:has()`,
  `:nth-child()` y escapes. Las **listas agrupadas** (`h1, h2, :is(h3, h4)`) se
  dividen en unidades independientes respetando las comas internas de las
  pseudoclases.
- **Detección de problemas.** Avisa de selectores repetidos (los fusiona),
  declaraciones duplicadas (conserva el último valor) y selectores sin
  declaraciones (los omite). Rechaza con un error explícito la sintaxis
  inválida y las construcciones no admitidas (`@media`, `@supports`,
  `@import`, `@keyframes`, reglas anidadas), sin ignorarlas en silencio.
- **Límites** de tamaño y complejidad (`maxCssChars`, número de selectores,
  declaraciones totales y por selector, longitud de valor).
- **Revisión antes de guardar.** La vista previa permite editar el valor
  esperado, ajustar los puntos por propiedad, excluir propiedades, reordenar y
  eliminar selectores, y elegir entre crear un ejercicio nuevo o reemplazar uno
  existente.
- **Revalidación y atomicidad.** El cuerpo que llega del navegador no es
  confiable: el servidor vuelve a validar cada selector y recalcula el valor
  canónico de cada declaración antes de escribir. Todo el guardado ocurre en una
  **única transacción** PostgreSQL (nada a medias).
- **Edición segura.** Reemplazar los selectores de un ejercicio con
  **puntuaciones registradas** o una **ronda activa** se **bloquea** (se
  conserva el historial); en ese caso hay que crear un ejercicio nuevo o
  archivar el actual. Nunca se recalculan ni se borran puntuaciones.
- Los **valores esperados son soluciones privadas**: solo se muestran en la zona
  administrativa autenticada y nunca se envían a los endpoints de alumno.
- La puntuación de un ejercicio importado usa el mismo mecanismo que el resto:
  `submit_css_selector` concede crédito parcial por propiedad correcta, una sola
  vez por grupo y ejercicio, comparando los selectores por su forma canónica.

> El CSS importado es el **CSS de referencia** (define las soluciones). No se
> genera a partir de él un CSS inicial defectuoso de forma automática; si se
> necesita un fragmento de partida para el alumno, se escribe aparte.

---

## 🛡️ Modelo de seguridad

- **El navegador nunca habla con PostgreSQL.** Toda la persistencia ocurre en
  el servidor (`src/lib/data/postgres.ts`) a través de los endpoints `/api/*`.
  La cadena `DATABASE_URL` solo existe en código de servidor.
- **Los códigos nunca viajan en claro.** Se guardan dos derivados:
  `code_lookup` (HMAC-SHA256 con *pepper* aleatorio en `app_secrets`, para
  búsquedas indexadas) y `code_hash` (bcrypt para verificación). El HTML y el
  JavaScript públicos no contienen códigos correctos.
- **Código de acceso de grupo (recuperable).** Además del lookup HMAC y el hash
  bcrypt (que verifican el acceso), se guarda **cifrado con AES-256-GCM** usando
  una clave que vive solo en `ACCESS_CODE_ENC_KEY` (nunca en la base de datos, el
  repositorio ni los registros). Se descifra únicamente en el servidor, en un
  endpoint `/api/admin/*` protegido por sesión de administrador, y nunca se
  devuelven hashes ni lookups; una sesión de grupo no puede leer los códigos.
- **Sesiones de administrador.** Cookie `HttpOnly` + `SameSite=Lax` con un
  token aleatorio; en `admin_sessions` solo se guarda su hash SHA-256. El
  **proxy** (`src/proxy.ts`) valida la sesión en cada petición protegida (páginas
  `/admin/*` y endpoints `/api/admin/*`) y las peticiones que cambian estado
  desde otro origen se rechazan (comprobación del `Origin`).
- **Sesiones de grupo.** Cookie `HttpOnly` (con `Secure` en producción) cuyo
  token aleatorio se guarda hasheado en `group_sessions`. Las páginas
  `/competicion/*` y los endpoints `/api/competicion/*` (salvo el acceso)
  exigen sesión de grupo válida, no revocada y no caducada.
- **Soluciones y puntuación solo en el servidor.** Los valores esperados y las
  reglas viven en la base de datos; el estado que recibe el cliente nunca los
  incluye, y la puntuación la decide la función SQL transaccional.
- **Defensa en profundidad en la BD.** Las funciones privilegiadas vuelven a
  comprobar que el actor es un administrador (`is_admin_user`) antes de
  actuar.
- **Puerto local.** El contenedor expone PostgreSQL solo en `127.0.0.1`; no se
  aplica RLS porque la base de datos no es accesible desde el navegador ni
  desde otras máquinas.
- Los **mensajes de error nunca revelan** si un código existe ni el código
  correcto.
- **Identidad no falsificable.** El proxy elimina siempre los encabezados
  entrantes `x-user-id`/`x-group-id` y solo los establece tras verificar la
  sesión, de modo que un cliente no puede suplantar a un administrador ni a un
  grupo.

---

## 📡 Tiempo real

El componente `RankingLive` sondea `/api/ranking` cada 5 segundos (y también al
volver a estar visible o recuperar la conexión). Está diseñado como punto único
de evolución: si se quiere reducir latencia, basta con sustituir el temporizador
por una suscripción **SSE/WebSocket** que entregue las mismas entradas a
`applyEntries(rankEntries(...))`; el resto del componente no cambia.

---

## 🧭 Arquitectura

```
src/
  app/                     App Router de Next.js
    layout.tsx             Layout raíz (html/body, metadatos, viewport)
    globals.css            Estilos globales (Tailwind v4)
    (site)/                Grupo de rutas públicas (Header/Footer + enlace de salto)
      layout.tsx
      page.tsx             Home
      ranking/page.tsx     Ranking público
      alumnos/page.tsx     Portal del alumno
      competicion/         Competición CSS (page.tsx, entrar/page.tsx)
      login/page.tsx       Acceso de administrador
    admin/                 Panel docente (layout propio)
      layout.tsx
      page.tsx             students/ groups/ assignments/ exercises/
      …                    css/ scores/ settings/ maintenance/
    api/                   Route Handlers (equivalente a los endpoints de Astro)
      ranking/route.ts     Ranking público
      submit-code/route.ts Validación atómica de códigos
      student/portal/      Portal del alumno
      competicion/         Acceso y entregas de la competición CSS
      admin/               CRUD del panel (grupos, alumnos, ejercicios, css, …)
      auth/                Inicio/cierre de sesión de administrador
  components/              Islas React (panel, alumnos, ranking, competición) y UI
    ui/                    Componentes de servidor (Alert, Card, ConfigNotice, …)
  lib/
    db.ts                  Pool de `pg` (solo servidor)
    config.ts              Estado de configuración (DATABASE_URL)
    auth/session.ts        Cookies y sesiones administrativas
    auth/group-session.ts  Cookies y sesiones de grupo (competición CSS)
    auth/request-context.ts Identidad verificada (cabeceras internas)
    css/selector.ts        Motor de selectores (dividir, validar y canonicalizar)
    css/validator.ts       Análisis y validación del CSS con PostCSS
    css/importer.ts        Análisis del bloque CSS de referencia y revalidación
    competition/draft.ts   Borradores y selector activo (localStorage, puro y testeable)
    crypto/access-code.ts  Cifrado recuperable (AES-256-GCM) del código de acceso de grupo
    data/postgres.ts       Acceso a datos del servidor (SQL)
    data/competition.ts    Datos de la competición CSS (solo servidor)
    data/admin.ts          Cliente del panel en el navegador (fetch a /api/admin/*)
    data/maintenance.ts    Purga masiva de grupos/alumnos (solo servidor)
    data/ranking.ts        Cliente de ranking en el navegador (fetch a /api/ranking)
    ranking.ts             Reglas de ordenación del ranking (puras, testeables)
    maintenance.ts         Definiciones compartidas de la purga masiva (frases de confirmación)
    validation.ts          Esquemas zod
  proxy.ts                 Autenticación y protección de rutas (antiguo middleware)
  types/                   Tipos compartidos
database/migrations/       Migraciones SQL versionadas
scripts/                   Runner de migraciones, seed y utilidades
tests/                     Pruebas unitarias (vitest)
```

---

## 🧪 Verificación

```bash
npm run typecheck      # 0 errores esperado
npm run lint           # eslint (sin errores ni avisos)
npm test               # 150 pruebas unitarias (selector, importador, navegación, validación y cifrado de códigos)
npm run build          # compila el SSR (Next.js 16 + Turbopack)
npm run db:check       # comprueba conexión, tablas, funciones y el generador de códigos
npm run db:penalty     # comprobaciones de puntuación por selector y penalización (base de datos)
npm run db:competition # comprobaciones de aislamiento de puntuación por competición (base de datos)
npm run db:delete      # comprobaciones de borrado de competiciones (base de datos)
npm run db:purge       # comprobaciones de la purga masiva de grupos/alumnos (base de datos, requiere base vacía)
npm run db:smoke       # comprobaciones end-to-end contra el servidor en marcha
```

---

## ☁️ Despliegue

Consulta [`DEPLOY_AWS_AMPLIFY.md`](./DEPLOY_AWS_AMPLIFY.md) para desplegar en
**AWS Amplify Hosting** con **Amazon RDS for PostgreSQL**.

---

## 📚 Documentación de la migración

- [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) — alcance, mapa de rutas,
  dependencias, riesgos y criterios de aceptación.
- [`MIGRATION_REPORT.md`](./MIGRATION_REPORT.md) — resultados verificados y
  limitaciones.
- [`DEPLOY_AWS_AMPLIFY.md`](./DEPLOY_AWS_AMPLIFY.md) — guía de despliegue.

---

## ⚠️ Solución de problemas

- **`password authentication failed` al migrar.** El volumen de Docker ya fue
  inicializado con otra contraseña (PostgreSQL solo aplica `POSTGRES_PASSWORD`
  en la primera inicialización). Si el contenedor aún no tiene datos, puedes
  recrear el volumen: `npm run db:down` y después `docker compose down -v`
  (¡borra los datos del contenedor!). Si hay datos reales, pon en `DATABASE_URL`
  la contraseña con la que se inicializó el volumen.
- **¿Contenedor levantado pero no acepta conexiones?** Espera al healthcheck:
  `docker compose ps`.
- **Puerto 5432 ocupado.** Cambia el mapeo en `docker-compose.yml` y la
  `DATABASE_URL` correspondiente.
- **`tsc` falla con errores de `.next/types/validator.ts`.** Elimina la carpeta
  `.next` y vuelve a ejecutar `npm run typecheck` (queda un `validator.ts`
  obsoleto de una build anterior).
- **Puerto 3000 ocupado (Next por defecto).** Arranca con
  `npm run dev -- -p 3001` o libera el puerto.
