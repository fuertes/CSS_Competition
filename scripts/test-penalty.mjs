#!/usr/bin/env node
/**
 * Pruebas de integración de la penalización configurable (solo base de datos).
 *
 * Ejercita directamente la función transaccional `public.submit_css_selector`
 * (la fuente de verdad de la puntuación), con datos de prueba temporales que se
 * limpian al terminar. No necesita el servidor en marcha.
 *
 * Cubre:
 *   - Penalización por propiedad incorrecta y una vez por entrega.
 *   - Propiedades omitidas o no reconocidas: no penalizan.
 *   - Una propiedad ya puntuada no vuelve a puntuar ni se penaliza.
 *   - Límite de cero vs. puntuación negativa permitida.
 *   - Idempotencia: el mismo requestId no duplica la penalización.
 *   - Entregas simultáneas: el saldo es correcto.
 *   - Interacción entre puntos base, bonificación por velocidad y penalización.
 *   - Restricciones de la configuración en la base de datos.
 *
 * Uso:
 *   npm run db:penalty
 */
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

if (existsSync(join(ROOT, '.env')) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(join(ROOT, '.env'));
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL. Copia .env.example a .env y complétala.');
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 4 });

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✔ ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const suffix = Date.now().toString(36);
const created = { groupId: null, exerciseId: null, selectorA: null, selectorB: null, selectorC: null };
let savedSettings = null;
let savedOpenRounds = [];

async function setSettings(partial) {
  const columns = Object.keys(partial);
  const values = Object.values(partial);
  const assignments = columns.map((column, index) => `${column} = $${index + 1}`).join(', ');
  await pool.query(`update public.competition_settings set ${assignments} where id = true`, values);
}

async function submit(groupId, selectorId, declarations, requestId = null) {
  const { rows } = await pool.query(
    'select public.submit_css_selector($1, $2, $3::jsonb, $4) as result',
    [groupId, selectorId, JSON.stringify(declarations), requestId],
  );
  return rows[0].result;
}

async function balance(groupId) {
  const { rows } = await pool.query(
    'select coalesce(total_points, 0) as points from public.group_scores where group_id = $1',
    [groupId],
  );
  return rows[0]?.points ?? 0;
}

async function resetGroup() {
  const g = created.groupId;
  // El trigger de puntuación solo reacciona a inserciones: hay que borrar el
  // marcador explícitamente para dejar el grupo a cero.
  await pool.query('delete from public.css_submission_requests where group_id = $1', [g]);
  await pool.query('delete from public.group_attempts where group_id = $1', [g]);
  await pool.query('delete from public.scoring_events where group_id = $1', [g]);
  await pool.query('delete from public.group_selector_bonuses where group_id = $1', [g]);
  await pool.query('delete from public.group_property_scores where group_id = $1', [g]);
  await pool.query('delete from public.group_scores where group_id = $1', [g]);
}

async function setup() {
  const settingsRes = await pool.query('select * from public.competition_settings where id = true');
  savedSettings = settingsRes.rows[0];

  const openRes = await pool.query('select id from public.competition_rounds where ended_at is null');
  savedOpenRounds = openRes.rows.map((row) => row.id);
  if (savedOpenRounds.length > 0) {
    await pool.query('update public.competition_rounds set ended_at = now() where ended_at is null');
  }

  const group = await pool.query(
    `insert into public.groups (name, color, active) values ($1, '#336699', true) returning id`,
    [`Penalty Test ${suffix}`],
  );
  created.groupId = group.rows[0].id;

  const exercise = await pool.query(
    `insert into public.exercises (title, description, points, kind, active, archived)
     values ($1, $2, 100, 'css', true, false) returning id`,
    [`Penalty Exercise ${suffix}`, 'Ejercicio temporal de prueba'],
  );
  created.exerciseId = exercise.rows[0].id;

  const selA = await pool.query(
    `insert into public.exercise_selectors (exercise_id, selector, position, active)
     values ($1, '.a', 0, true) returning id`,
    [created.exerciseId],
  );
  created.selectorA = selA.rows[0].id;
  const selB = await pool.query(
    `insert into public.exercise_selectors (exercise_id, selector, position, active)
     values ($1, '.b', 1, true) returning id`,
    [created.exerciseId],
  );
  created.selectorB = selB.rows[0].id;
  const selC = await pool.query(
    `insert into public.exercise_selectors (exercise_id, selector, position, active)
     values ($1, '.c', 2, true) returning id`,
    [created.exerciseId],
  );
  created.selectorC = selC.rows[0].id;

  await pool.query(
    `insert into public.selector_rules (selector_id, property_name, expected_canonical, points)
     values ($1, 'color', 'red', 10), ($1, 'padding', '0px', 10)`,
    [created.selectorA],
  );
  await pool.query(
    `insert into public.selector_rules (selector_id, property_name, expected_canonical, points)
     values ($1, 'color', 'red', 10)`,
    [created.selectorB],
  );
  await pool.query(
    `insert into public.selector_rules (selector_id, property_name, expected_canonical, points)
     values ($1, 'color', 'green', 10)`,
    [created.selectorC],
  );

  await pool.query('insert into public.competition_rounds (exercise_id) values ($1)', [
    created.exerciseId,
  ]);
}

async function cleanup() {
  try {
    if (created.exerciseId) {
      await pool.query('delete from public.competition_rounds where exercise_id = $1', [
        created.exerciseId,
      ]);
    }
    if (created.groupId) {
      await pool.query('delete from public.groups where id = $1', [created.groupId]);
    }
    if (created.exerciseId) {
      await pool.query('delete from public.exercises where id = $1', [created.exerciseId]);
    }
    if (savedSettings) {
      await pool.query(
        `update public.competition_settings
         set penalty_enabled = $1, penalty_points = $2, penalty_mode = $3,
             allow_negative_score = $4, css_speed_bonus_points = $5,
             css_speed_bonus_seconds = $6
         where id = true`,
        [
          savedSettings.penalty_enabled,
          savedSettings.penalty_points,
          savedSettings.penalty_mode,
          savedSettings.allow_negative_score,
          savedSettings.css_speed_bonus_points,
          savedSettings.css_speed_bonus_seconds,
        ],
      );
    }
    for (const roundId of savedOpenRounds) {
      await pool.query('update public.competition_rounds set ended_at = null where id = $1', [
        roundId,
      ]);
    }
  } catch (error) {
    console.error('Error durante la limpieza:', error);
  }
}

async function run() {
  await setup();
  const g = created.groupId;

  // --- Configuración inválida rechazada por la BD (test #14) ------------------
  let negativeRejected = false;
  try {
    await pool.query('update public.competition_settings set penalty_points = -1 where id = true');
  } catch {
    negativeRejected = true;
  }
  check('La BD rechaza una penalización negativa', negativeRejected);

  let modeRejected = false;
  try {
    await pool.query("update public.competition_settings set penalty_mode = 'x' where id = true");
  } catch {
    modeRejected = true;
  }
  check('La BD rechaza un modo de penalización desconocido', modeRejected);

  let baseRejected = false;
  try {
    await pool.query('update public.competition_settings set css_points_per_property = 0 where id = true');
  } catch {
    baseRejected = true;
  }
  check('La BD rechaza puntos base por propiedad no positivos', baseRejected);

  // --- Modo A: penalización por cada propiedad incorrecta ----------------------
  await resetGroup();
  await setSettings({
    penalty_enabled: true,
    penalty_points: 5,
    penalty_mode: 'per_property',
    allow_negative_score: true,
    css_speed_bonus_points: 0,
  });
  const modeA = await submit(g, created.selectorA, [
    { property: 'color', value: 'red' },
    { property: 'padding', value: '9px' },
  ]);
  check(
    'Modo A: una propiedad incorrecta descuenta la penalización configurada',
    modeA.status === 'ok' && modeA.awarded === 10 && modeA.penalty === 5 && modeA.net === 5,
    `awarded=${modeA.awarded} penalty=${modeA.penalty} net=${modeA.net}`,
  );
  check('Modo A: el saldo refleja el neto', (await balance(g)) === 5, `balance=${await balance(g)}`);

  await resetGroup();
  const modeA2 = await submit(g, created.selectorA, [
    { property: 'color', value: 'blue' },
    { property: 'padding', value: '9px' },
  ]);
  check(
    'Modo A: dos propiedades incorrectas descuentan dos veces',
    modeA2.awarded === 0 && modeA2.penalty === 10 && modeA2.net === -10,
    `penalty=${modeA2.penalty}`,
  );
  check('Modo A: con negativos permitidos el saldo baja de cero', (await balance(g)) === -10);

  // --- Modo B: una única penalización por entrega con errores ------------------
  await resetGroup();
  await setSettings({ penalty_enabled: true, penalty_points: 5, penalty_mode: 'per_submission', allow_negative_score: true });
  const modeB = await submit(g, created.selectorA, [
    { property: 'color', value: 'blue' },
    { property: 'padding', value: '9px' },
  ]);
  check(
    'Modo B: varias propiedades incorrectas descuentan una sola vez',
    modeB.awarded === 0 && modeB.penalty === 5 && modeB.net === -5,
    `penalty=${modeB.penalty}`,
  );

  // --- Propiedades omitidas / no reconocidas: sin penalización -----------------
  await resetGroup();
  await setSettings({ penalty_enabled: true, penalty_points: 5, penalty_mode: 'per_property', allow_negative_score: true });
  const omitted = await submit(g, created.selectorA, [{ property: 'color', value: 'red' }]);
  check(
    'Una propiedad omitida (trabajo incremental) no penaliza',
    omitted.awarded === 10 && omitted.penalty === 0 && omitted.net === 10,
    `penalty=${omitted.penalty}`,
  );
  const unknown = await submit(g, created.selectorA, [{ property: 'border', value: '1px' }]);
  check(
    'Una propiedad no reconocida no puntúa ni penaliza',
    unknown.awarded === 0 && unknown.penalty === 0,
    `awarded=${unknown.awarded} penalty=${unknown.penalty}`,
  );

  // --- Propiedad ya puntuada: no vuelve a puntuar ni se penaliza ---------------
  await resetGroup();
  await setSettings({ penalty_enabled: true, penalty_points: 5, penalty_mode: 'per_property', allow_negative_score: true });
  await submit(g, created.selectorA, [{ property: 'color', value: 'red' }]);
  const againCorrect = await submit(g, created.selectorA, [{ property: 'color', value: 'red' }]);
  check(
    'Repetir una propiedad correcta no vuelve a puntuar',
    againCorrect.awarded === 0 && againCorrect.penalty === 0,
    `awarded=${againCorrect.awarded}`,
  );
  const againWrong = await submit(g, created.selectorA, [{ property: 'color', value: 'blue' }]);
  check(
    'Volver a una propiedad ya resuelta con otro valor no penaliza',
    againWrong.awarded === 0 && againWrong.penalty === 0,
    `penalty=${againWrong.penalty}`,
  );
  check('El saldo se mantiene en 10 tras los reintentos', (await balance(g)) === 10, `balance=${await balance(g)}`);

  // --- Límite de cero (no permitir negativos) ----------------------------------
  await resetGroup();
  await setSettings({ penalty_enabled: true, penalty_points: 100, penalty_mode: 'per_property', allow_negative_score: false });
  const clampNoPoints = await submit(g, created.selectorA, [{ property: 'color', value: 'blue' }]);
  check(
    'Con saldo 0 y sin negativos, la penalización queda en 0',
    clampNoPoints.penalty === 0 && (await balance(g)) === 0,
    `penalty=${clampNoPoints.penalty} balance=${await balance(g)}`,
  );
  await submit(g, created.selectorA, [{ property: 'color', value: 'red' }]);
  const clampPartial = await submit(g, created.selectorA, [{ property: 'padding', value: '9px' }]);
  check(
    'La penalización se limita al saldo disponible sin bajar de cero',
    clampPartial.penalty === 10 && (await balance(g)) === 0,
    `penalty=${clampPartial.penalty} balance=${await balance(g)}`,
  );

  // --- Permitir puntuación negativa --------------------------------------------
  await resetGroup();
  await setSettings({ penalty_enabled: true, penalty_points: 100, penalty_mode: 'per_property', allow_negative_score: true });
  const negative = await submit(g, created.selectorA, [{ property: 'color', value: 'blue' }]);
  check(
    'Con negativos permitidos la penalización completa se aplica',
    negative.penalty === 100 && (await balance(g)) === -100,
    `penalty=${negative.penalty} balance=${await balance(g)}`,
  );

  // --- Idempotencia: el mismo requestId no duplica la penalización -------------
  await resetGroup();
  await setSettings({ penalty_enabled: true, penalty_points: 5, penalty_mode: 'per_property', allow_negative_score: true });
  const requestId = randomUUID();
  const first = await submit(g, created.selectorA, [{ property: 'color', value: 'blue' }], requestId);
  const retry = await submit(g, created.selectorA, [{ property: 'color', value: 'blue' }], requestId);
  check(
    'Un reintento con el mismo requestId devuelve la respuesta original',
    JSON.stringify(first) === JSON.stringify(retry) && retry.penalty === 5,
    `first=${first.penalty} retry=${retry.penalty}`,
  );
  check('El reintento no vuelve a penalizar', (await balance(g)) === -5, `balance=${await balance(g)}`);
  const penaltyEvents = await pool.query(
    "select count(*)::int as n from public.scoring_events where group_id = $1 and kind = 'penalty'",
    [g],
  );
  check('Solo se registra un evento de penalización', penaltyEvents.rows[0].n === 1, `eventos=${penaltyEvents.rows[0].n}`);

  // --- Entregas simultáneas con el mismo requestId ----------------------------
  await resetGroup();
  const concurrentRequest = randomUUID();
  const [c1, c2] = await Promise.all([
    submit(g, created.selectorA, [{ property: 'color', value: 'blue' }], concurrentRequest),
    submit(g, created.selectorA, [{ property: 'color', value: 'blue' }], concurrentRequest),
  ]);
  check(
    'Dos entregas simultáneas con el mismo requestId no duplican la penalización',
    c1.penalty === 5 && c2.penalty === 5 && (await balance(g)) === -5,
    `balance=${await balance(g)}`,
  );

  // --- Concurrencia de puntuación positiva ------------------------------------
  await resetGroup();
  await setSettings({ penalty_enabled: false, penalty_points: 0, css_speed_bonus_points: 0 });
  const [p1, p2] = await Promise.all([
    submit(g, created.selectorA, [{ property: 'color', value: 'red' }]),
    submit(g, created.selectorA, [{ property: 'color', value: 'red' }]),
  ]);
  const concurrencyTotal = (p1.awarded ?? 0) + (p2.awarded ?? 0);
  check(
    'Dos entregas simultáneas de la misma propiedad → solo una puntúa',
    concurrencyTotal === 10 && (await balance(g)) === 10,
    `awarded total=${concurrencyTotal} balance=${await balance(g)}`,
  );

  // --- Interacción: puntos base + bonificación por velocidad + penalización ----
  await resetGroup();
  await setSettings({
    penalty_enabled: true,
    penalty_points: 5,
    penalty_mode: 'per_property',
    allow_negative_score: true,
    css_speed_bonus_points: 20,
    css_speed_bonus_seconds: 3600,
  });
  // Primer intento parcial (crea el primer intento del que se mide el tiempo).
  await submit(g, created.selectorA, [{ property: 'color', value: 'red' }]);
  // Intento final: completa el selector sin errores.
  const complete = await submit(g, created.selectorA, [
    { property: 'color', value: 'red' },
    { property: 'padding', value: '0px' },
  ]);
  check(
    'Completar sin errores: puntos base + bonificación, sin penalización',
    complete.awarded === 30 && complete.speed_bonus === true && complete.penalty === 0 &&
      complete.fully_correct === true,
    `awarded=${complete.awarded} bonus=${complete.speed_bonus} penalty=${complete.penalty}`,
  );
  check('El saldo suma puntos base y bonificación', (await balance(g)) === 40, `balance=${await balance(g)}`);

  // La penalización no se aplica a una entrega sin errores aunque haya bonus.
  check(
    'Una entrega con bonificación no registra eventos de penalización',
    (await pool.query(
      "select count(*)::int as n from public.scoring_events where group_id = $1 and kind = 'penalty'",
      [g],
    )).rows[0].n === 0,
  );

  // --- Puntuación independiente por selector (misma propiedad y valor) --------
  // La unidad de corrección es la regla (exercise + selector + property + valor):
  // `color: red` en el selector A y en el selector B deben puntuar por separado.
  await resetGroup();
  await setSettings({
    penalty_enabled: false,
    penalty_points: 0,
    css_speed_bonus_points: 0,
  });

  const indepA = await submit(g, created.selectorA, [{ property: 'color', value: 'red' }]);
  check(
    'El selector A puntúa su regla color:red',
    indepA.status === 'ok' && indepA.awarded === 10 && indepA.new_properties === 1,
    `awarded=${indepA.awarded} new=${indepA.new_properties}`,
  );

  const indepB = await submit(g, created.selectorB, [{ property: 'color', value: 'red' }]);
  check(
    'El mismo color:red en el selector B puntúa de forma independiente',
    indepB.status === 'ok' && indepB.awarded === 10 && indepB.new_properties === 1 &&
      indepB.fully_correct === true,
    `awarded=${indepB.awarded} new=${indepB.new_properties}`,
  );
  check(
    'El saldo suma los puntos de ambos selectores',
    (await balance(g)) === 20,
    `balance=${await balance(g)}`,
  );

  const indepARepeat = await submit(g, created.selectorA, [{ property: 'color', value: 'red' }]);
  check(
    'Reenviar la regla del selector A no duplica sus puntos',
    indepARepeat.awarded === 0 && indepARepeat.new_properties === 0,
    `awarded=${indepARepeat.awarded}`,
  );

  // Un valor correcto en A no hace correcta la misma regla en C (valor distinto).
  const crossValue = await submit(g, created.selectorC, [{ property: 'color', value: 'red' }]);
  check(
    'Un valor que solo es correcto en otro selector no puntúa en el actual',
    crossValue.awarded === 0 && crossValue.new_properties === 0 && crossValue.fully_correct === false,
    `awarded=${crossValue.awarded}`,
  );

  const fixedC = await submit(g, created.selectorC, [{ property: 'color', value: 'green' }]);
  check(
    'Corregir el valor del selector C concede sus puntos',
    fixedC.awarded === 10 && fixedC.new_properties === 1,
    `awarded=${fixedC.awarded}`,
  );

  // Los registros de puntuación quedan asociados a cada selector.
  const scoreRows = await pool.query(
    `select selector_id, points from public.group_property_scores
     where group_id = $1 and property_name = 'color' and selector_id in ($2, $3)`,
    [g, created.selectorA, created.selectorB],
  );
  check(
    'Se registra una puntuación de color por selector, sin mezclarse',
    scoreRows.rows.length === 2 &&
      scoreRows.rows.every((row) => row.points === 10) &&
      new Set(scoreRows.rows.map((row) => row.selector_id)).size === 2,
    `filas=${scoreRows.rows.length}`,
  );

  // Corregir A no crea registros de puntuación en B.
  await resetGroup();
  await submit(g, created.selectorA, [{ property: 'color', value: 'red' }]);
  const otherSelectorScores = await pool.query(
    `select count(*)::int as n from public.group_property_scores
     where group_id = $1 and selector_id = $2`,
    [g, created.selectorB],
  );
  check(
    'Corregir el selector A no crea puntuaciones del selector B',
    otherSelectorScores.rows[0].n === 0,
    `filas B=${otherSelectorScores.rows[0].n}`,
  );

  // Dos selectores distintos pueden puntuar la misma propiedad a la vez.
  await resetGroup();
  const [parA, parB] = await Promise.all([
    submit(g, created.selectorA, [{ property: 'color', value: 'red' }]),
    submit(g, created.selectorB, [{ property: 'color', value: 'red' }]),
  ]);
  check(
    'Dos selectores distintos puntúan la misma propiedad de forma simultánea',
    parA.awarded === 10 && parB.awarded === 10 && (await balance(g)) === 20,
    `a=${parA.awarded} b=${parB.awarded} balance=${await balance(g)}`,
  );

  // --- Selector ajeno: no puntúa ni penaliza ----------------------------------
  await resetGroup();
  await setSettings({ penalty_enabled: true, penalty_points: 5, penalty_mode: 'per_property', allow_negative_score: true });
  const foreign = await submit(g, randomUUID(), [{ property: 'color', value: 'blue' }]);
  check(
    'Una entrega sobre un selector inexistente no puntúa ni penaliza',
    foreign.status === 'invalid_selector' && (await balance(g)) === 0,
    `status=${foreign.status} balance=${await balance(g)}`,
  );

  console.log(`\nResultado: ${passed} correctos, ${failed} fallos`);
  if (failures.length > 0) {
    console.log('Fallos:');
    for (const name of failures) console.log(`  - ${name}`);
  }
}

let exitCode = 0;
try {
  await run();
  if (failed > 0) exitCode = 1;
} catch (error) {
  console.error('Error inesperado en las pruebas de penalización:', error);
  exitCode = 1;
} finally {
  await cleanup();
  await pool.end();
}
process.exit(exitCode);
