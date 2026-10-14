#!/usr/bin/env node
/**
 * Pruebas de integración del BORRADO de una competición (solo base de datos).
 *
 * Una competición es una ejecución (`competition_rounds`). Esta prueba
 * ejercita directamente la función transaccional
 * `public.delete_competition_round` (la fuente de verdad) con datos temporales
 * que se limpian al terminar. No necesita el servidor en marcha.
 *
 * Cubre la lista obligatoria:
 *   1. Un administrador puede eliminar una competición (borrado real).
 *   2. Un actor que no es administrador no puede (error de permisos).
 *   3. Cancelar/eliminar no altera otras competiciones ni la de otros grupos.
 *   4. Se limpian los datos dependientes (participantes, intentos,
 *      puntuaciones por propiedad, eventos y bonificaciones).
 *   5. Los grupos, sus códigos de acceso y el ejercicio compartido se
 *      conservan intactos.
 *   6. No quedan puntuaciones huérfanas: el marcador agregado se recalcula.
 *   7. Un error de base de datos no deja un borrado a medias.
 *   8. Tras eliminar (cancelar), no se pueden generar puntos por la vía de esa
 *      competición, ni siquiera con registros tardíos.
 *
 * Uso:
 *   npm run db:delete
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

const pool = new Pool({ connectionString, max: 6 });

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
const created = { groups: {}, exerciseId: null, selectors: {}, rounds: [], adminId: null };
let savedSettings = null;
let savedOpenRounds = [];

const SETTINGS_COLUMNS = [
  'penalty_enabled',
  'penalty_points',
  'penalty_mode',
  'allow_negative_score',
  'css_speed_bonus_points',
  'css_speed_bonus_seconds',
];

async function setSettings(partial) {
  const columns = Object.keys(partial);
  const values = Object.values(partial);
  const assignments = columns.map((column, index) => `${column} = $${index + 1}`).join(', ');
  await pool.query(`update public.competition_settings set ${assignments} where id = true`, values);
}

async function submit(groupId, selectorId, declarations) {
  const { rows } = await pool.query(
    'select public.submit_css_selector($1, $2, $3::jsonb, null) as result',
    [groupId, selectorId, JSON.stringify(declarations)],
  );
  return rows[0].result;
}

async function globalBalance(groupId) {
  const { rows } = await pool.query(
    'select coalesce(total_points, 0) as points, last_scored_at from public.group_scores where group_id = $1',
    [groupId],
  );
  return rows[0] ?? { points: 0, last_scored_at: null };
}

async function startRound(exerciseId) {
  await pool.query('update public.competition_rounds set ended_at = now() where ended_at is null');
  const { rows } = await pool.query(
    'insert into public.competition_rounds (exercise_id) values ($1) returning id',
    [exerciseId],
  );
  const id = rows[0].id;
  created.rounds.push(id);
  return id;
}

async function countForRound(table, roundId) {
  const { rows } = await pool.query(
    `select count(*)::int as n from public.${table} where round_id = $1`,
    [roundId],
  );
  return rows[0].n;
}

async function deleteRound(roundId, actorId) {
  const { rows } = await pool.query(
    'select public.delete_competition_round($1, $2) as result',
    [roundId, actorId],
  );
  return rows[0].result;
}

async function setup() {
  const settingsRes = await pool.query('select * from public.competition_settings where id = true');
  savedSettings = settingsRes.rows[0];

  const openRes = await pool.query('select id from public.competition_rounds where ended_at is null');
  savedOpenRounds = openRes.rows.map((row) => row.id);
  if (savedOpenRounds.length > 0) {
    await pool.query('update public.competition_rounds set ended_at = now() where ended_at is null');
  }

  await setSettings({
    penalty_enabled: false,
    penalty_points: 0,
    penalty_mode: 'per_property',
    allow_negative_score: false,
    css_speed_bonus_points: 0,
    css_speed_bonus_seconds: 120,
  });

  const admin = await pool.query(
    `insert into public.admin_users (email, password_hash)
     values ($1, 'x') returning id`,
    [`delete-test-${suffix}@example.com`],
  );
  created.adminId = admin.rows[0].id;

  const exercise = await pool.query(
    `insert into public.exercises (title, description, points, kind, active, archived)
     values ($1, '', 100, 'css', true, false) returning id`,
    [`Delete Test ${suffix}`],
  );
  created.exerciseId = exercise.rows[0].id;

  for (const [key, selector, position] of [
    ['a', '.a', 0],
    ['b', '.b', 1],
  ]) {
    const { rows } = await pool.query(
      `insert into public.exercise_selectors (exercise_id, selector, position, active)
       values ($1, $2, $3, true) returning id`,
      [created.exerciseId, selector, position],
    );
    created.selectors[key] = rows[0].id;
  }

  await pool.query(
    `insert into public.selector_rules (selector_id, property_name, expected_canonical, points)
     values ($1, 'color', 'red', 50), ($1, 'padding', '0px', 50)`,
    [created.selectors.a],
  );
  await pool.query(
    `insert into public.selector_rules (selector_id, property_name, expected_canonical, points)
     values ($1, 'color', 'red', 50)`,
    [created.selectors.b],
  );

  for (const name of ['D1', 'D2']) {
    const { rows } = await pool.query(
      `insert into public.groups (name, color, active) values ($1, '#336699', true) returning id`,
      [`${name}-${suffix}`],
    );
    created.groups[name] = rows[0].id;
  }

  // Simula un código de acceso ya emitido para el grupo D1 (hash + lookup +
  // cifrado) para comprobar que el borrado no lo toca.
  await pool.query(
    `update public.groups
     set access_code_lookup = $2, access_code_hash = $3, access_code_encrypted = $4
     where id = $1`,
    [created.groups.D1, 'lookup-simulado', 'hash-simulado', 'cifrado-simulado'],
  );

  // Grupo ajeno que NO participará en la competición a eliminar.
  const outsider = await pool.query(
    `insert into public.groups (name, color, active) values ($1, '#996633', true) returning id`,
    [`D3-${suffix}`],
  );
  created.groups.D3 = outsider.rows[0].id;
}

async function cleanup() {
  try {
    for (const roundId of created.rounds) {
      await pool.query('delete from public.competition_rounds where id = $1', [roundId]);
    }
    for (const groupId of Object.values(created.groups)) {
      await pool.query('delete from public.groups where id = $1', [groupId]);
    }
    if (created.exerciseId) {
      await pool.query('delete from public.exercises where id = $1', [created.exerciseId]);
    }
    if (created.adminId) {
      await pool.query('delete from public.admin_users where id = $1', [created.adminId]);
    }
    if (savedSettings) {
      await pool.query(
        `update public.competition_settings
         set penalty_enabled = $1, penalty_points = $2, penalty_mode = $3,
             allow_negative_score = $4, css_speed_bonus_points = $5,
             css_speed_bonus_seconds = $6
         where id = true`,
        SETTINGS_COLUMNS.map((column) => savedSettings[column]),
      );
    }
    for (const roundId of savedOpenRounds) {
      await pool.query('update public.competition_rounds set ended_at = null where id = $1', [roundId]);
    }
  } catch (error) {
    console.error('Error durante la limpieza:', error);
  }
}

async function run() {
  await setup();
  const g1 = created.groups.D1;
  const g2 = created.groups.D2;
  const g3 = created.groups.D3;

  // ==========================================================================
  // Competición A: D1 y D2 puntúan. D3 queda fuera del roster (se añade después).
  // ==========================================================================
  const roundA = await startRound(created.exerciseId);
  const a1 = await submit(g1, created.selectors.a, [{ property: 'color', value: 'red' }]);
  const a2 = await submit(g2, created.selectors.a, [{ property: 'color', value: 'red' }]);

  check(
    'Preparación: dos grupos puntúan 50 en la competición A',
    a1.awarded === 50 && a2.awarded === 50,
    `a1=${a1.awarded} a2=${a2.awarded}`,
  );
  check(
    '6. El marcador agregado de D1 refleja 50 puntos',
    (await globalBalance(g1)).points === 50,
    `global=${(await globalBalance(g1)).points}`,
  );

  // ==========================================================================
  // 2 y 7. Un actor que no es administrador no puede borrar; nada cambia.
  // ==========================================================================
  let forbidden = false;
  let forbiddenCode = '';
  try {
    await deleteRound(roundA, randomUUID());
  } catch (error) {
    forbidden = true;
    forbiddenCode = error?.code ?? '';
  }
  const roundAAfterForbidden = await pool.query(
    'select count(*)::int as n from public.competition_rounds where id = $1',
    [roundA],
  );
  check(
    '2. Un actor que no es administrador no puede eliminar la competición',
    forbidden && forbiddenCode === '42501',
    `forbidden=${forbidden} code=${forbiddenCode}`,
  );
  check(
    '7. El intento no autorizado no ha borrado nada (sin borrado a medias)',
    roundAAfterForbidden.rows[0].n === 1 &&
      (await countForRound('scoring_events', roundA)) === 2 &&
      (await globalBalance(g1)).points === 50,
    `ronda=${roundAAfterForbidden.rows[0].n} eventos=${await countForRound('scoring_events', roundA)}`,
  );

  // Un identificador inexistente falla con P0002 y no altera nada.
  let notFound = false;
  let notFoundCode = '';
  try {
    await deleteRound(randomUUID(), created.adminId);
  } catch (error) {
    notFound = true;
    notFoundCode = error?.code ?? '';
  }
  check(
    '7. Eliminar una competición inexistente falla limpiamente (P0002)',
    notFound && notFoundCode === 'P0002',
    `code=${notFoundCode}`,
  );

  // ==========================================================================
  // 3 y 5. D3 no participa en A: eliminarlo no debe afectarle ni tocar el grupo.
  // ==========================================================================
  const beforeDeleteGroups = await pool.query(
    'select id, access_code_lookup, access_code_hash, access_code_encrypted from public.groups where id = $1',
    [g1],
  );

  // ==========================================================================
  // 1, 4, 5 y 6. Borrado real por el administrador.
  // ==========================================================================
  const result = await deleteRound(roundA, created.adminId);

  check(
    '1. El administrador elimina la competición (borrado real)',
    result.id === roundA &&
      result.participants >= 2 &&
      result.scoringEvents === 2 &&
      result.wasOpen === true,
    `id=${result.id} participantes=${result.participants} eventos=${result.scoringEvents}`,
  );

  const roundGone = await pool.query(
    'select count(*)::int as n from public.competition_rounds where id = $1',
    [roundA],
  );
  check('4. La competición ya no existe en la base de datos', roundGone.rows[0].n === 0);

  check(
    '4. Se limpian participantes, eventos, puntuaciones por propiedad, intentos y bonificaciones',
    (await countForRound('competition_participants', roundA)) === 0 &&
      (await countForRound('scoring_events', roundA)) === 0 &&
      (await countForRound('group_property_scores', roundA)) === 0 &&
      (await countForRound('group_attempts', roundA)) === 0 &&
      (await countForRound('group_selector_bonuses', roundA)) === 0,
    `participantes=${await countForRound('competition_participants', roundA)} eventos=${await countForRound('scoring_events', roundA)}`,
  );

  const groupsAfter = await pool.query(
    'select id, access_code_lookup, access_code_hash, access_code_encrypted from public.groups where id = $1',
    [g1],
  );
  const groupBefore = beforeDeleteGroups.rows[0];
  const groupAfter = groupsAfter.rows[0];
  check(
    '5. Los grupos se conservan con sus códigos de acceso intactos',
    groupsAfter.rows.length === 1 &&
      groupAfter.access_code_lookup === groupBefore.access_code_lookup &&
      groupAfter.access_code_hash === groupBefore.access_code_hash &&
      groupAfter.access_code_encrypted === groupBefore.access_code_encrypted,
    'los códigos de acceso cambiaron',
  );
  check(
    '5. El grupo ajeno a la competición sigue existiendo',
    (await pool.query('select count(*)::int as n from public.groups where id = $1', [g3])).rows[0].n === 1,
  );

  const exerciseAfter = await pool.query(
    `select
       (select count(*)::int from public.exercises where id = $1) as exercise,
       (select count(*)::int from public.exercise_selectors where exercise_id = $1) as selectors,
       (select count(*)::int from public.selector_rules r
          join public.exercise_selectors s on s.id = r.selector_id
        where s.exercise_id = $1) as rules`,
    [created.exerciseId],
  );
  check(
    '5. El ejercicio compartido y sus soluciones se conservan intactos',
    exerciseAfter.rows[0].exercise === 1 &&
      exerciseAfter.rows[0].selectors === 2 &&
      exerciseAfter.rows[0].rules === 3,
    `ejercicio=${exerciseAfter.rows[0].exercise} selectores=${exerciseAfter.rows[0].selectors} reglas=${exerciseAfter.rows[0].rules}`,
  );

  const balanceAfter = await globalBalance(g1);
  check(
    '6. No quedan puntuaciones huérfanas: el marcador agregado vuelve a 0',
    balanceAfter.points === 0,
    `global=${balanceAfter.points}`,
  );
  check(
    '6. El marcador agregado del otro grupo también se recalcula',
    (await globalBalance(g2)).points === 0,
    `global=${(await globalBalance(g2)).points}`,
  );

  // ==========================================================================
  // 8. Tras el borrado no se pueden generar puntos por esa competición.
  // ==========================================================================
  const afterDeleteSubmit = await submit(g1, created.selectors.a, [{ property: 'color', value: 'red' }]);
  check(
    '8. Sin competición abierta, una entrega no puntúa (no_round) y no crea datos',
    afterDeleteSubmit.status === 'no_round' &&
      (await countForRound('scoring_events', roundA)) === 0,
    `status=${afterDeleteSubmit.status}`,
  );

  // Un registro tardío que referencie la competición borrada es rechazado por
  // la clave foránea (no puede aparecer una puntuación huérfana).
  let fkViolation = false;
  try {
    await pool.query(
      `insert into public.scoring_events (group_id, exercise_id, selector_id, round_id, property_name, kind, points)
       values ($1, $2, $3, $4, 'color', 'property', 50)`,
      [g1, created.exerciseId, created.selectors.a, roundA],
    );
  } catch (error) {
    fkViolation = error?.code === '23503';
  }
  check(
    '8. Un evento tardío que apunte a la competición eliminada es rechazado (FK)',
    fkViolation,
  );
  check(
    '8. El marcador agregado sigue a 0 tras el intento tardío',
    (await globalBalance(g1)).points === 0,
    `global=${(await globalBalance(g1)).points}`,
  );

  // ==========================================================================
  // 3. Eliminar una competición no altera a las demás.
  // ==========================================================================
  const roundB = await startRound(created.exerciseId);
  const b1 = await submit(g3, created.selectors.a, [{ property: 'color', value: 'red' }]);
  check(
    '3. La competición B acumula puntos de forma independiente',
    b1.awarded === 50,
    `awarded=${b1.awarded}`,
  );
  await pool.query('update public.competition_rounds set ended_at = now() where id = $1', [roundB]);

  const roundC = await startRound(created.exerciseId);
  const c1 = await submit(g3, created.selectors.a, [{ property: 'color', value: 'red' }]);
  check(
    '3. La competición C (nueva, abierta) acumula puntos por separado',
    c1.awarded === 50,
    `awarded=${c1.awarded}`,
  );

  const deleteBResult = await deleteRound(roundB, created.adminId);
  const roundBAfter = await pool.query(
    'select count(*)::int as n from public.competition_rounds where id = $1',
    [roundB],
  );
  const roundCAfter = await pool.query(
    'select count(*)::int as n from public.competition_rounds where id = $1',
    [roundC],
  );
  check(
    '3. Eliminar la competición B no afecta a la competición C',
    deleteBResult.id === roundB &&
      roundBAfter.rows[0].n === 0 &&
      roundCAfter.rows[0].n === 1 &&
      (await countForRound('scoring_events', roundB)) === 0 &&
      (await countForRound('scoring_events', roundC)) === 1,
    `B=${roundBAfter.rows[0].n} C=${roundCAfter.rows[0].n} eventosC=${await countForRound('scoring_events', roundC)}`,
  );

  check(
    '3. El marcador recalculado no arrastra los puntos de la competición eliminada',
    (await globalBalance(g3)).points === 50,
    `global=${(await globalBalance(g3)).points}`,
  );

  const stillOpen = await submit(g3, created.selectors.b, [{ property: 'color', value: 'red' }]);
  check(
    '3. La competición abierta sigue operativa tras eliminar otra',
    stillOpen.status === 'ok' && stillOpen.awarded === 50,
    `status=${stillOpen.status} awarded=${stillOpen.awarded}`,
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
  console.error('Error inesperado en las pruebas de borrado de competición:', error);
  exitCode = 1;
} finally {
  await cleanup();
  await pool.end();
}
process.exit(exitCode);
