#!/usr/bin/env node
/**
 * Pruebas de integración del MANTENIMIENTO MASIVO (solo base de datos).
 *
 * Ejercita directamente la función transaccional `public.purge_entities`
 * (migración 0014), que es la fuente de verdad, con datos temporales que se
 * limpian al terminar. No necesita el servidor en marcha.
 *
 * SEGURIDAD: la purga es global (borra TODOS los grupos y/o alumnos). El script
 * se niega a ejecutarse si ya hay grupos o alumnos en la base de datos, para no
 * destruir datos reales. Úsalo contra una base de datos de pruebas vacía.
 *
 * Cubre la lista obligatoria:
 *   1. Un administrador puede ejecutar cada operación autorizada.
 *   2. Un usuario sin permisos no puede realizar ninguna eliminación.
 *   3. La confirmación incompleta/incorrecta impide ejecutar la operación.
 *   4. El número de registros se calcula en el servidor.
 *   5. Eliminar alumnos no elimina los grupos ni las competiciones.
 *   6. Eliminar grupos no elimina los ejercicios ni el historial compartido.
 *   7. La operación combinada se revierte por completo si se produce un error.
 *   8. Las claves foráneas y restricciones siguen siendo válidas.
 *   9. Las solicitudes repetidas no provocan resultados inconsistentes.
 *  10. Los datos que deben conservarse siguen disponibles tras la limpieza.
 *
 * Uso:
 *   npm run db:purge
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
const created = { groups: {}, students: {}, exerciseIds: [], selectors: {}, roundIds: [], adminId: null, codeExerciseId: null, cssExerciseId: null };
let savedSettings = null;

const CONFIRMATIONS = {
  groups: 'ELIMINAR TODOS LOS GRUPOS',
  students: 'ELIMINAR TODOS LOS ALUMNOS',
  both: 'VACIAR GRUPOS Y ALUMNOS',
};

async function count(table, where = '') {
  const { rows } = await pool.query(`select count(*)::int as n from public.${table} ${where}`);
  return rows[0].n;
}

async function setSettings(partial) {
  const columns = Object.keys(partial);
  const values = Object.values(partial);
  const assignments = columns.map((column, index) => `${column} = $${index + 1}`).join(', ');
  await pool.query(`update public.competition_settings set ${assignments} where id = true`, values);
}

async function purge(scope, confirmation, actorId) {
  const { rows } = await pool.query('select public.purge_entities($1, $2, $3) as result', [
    scope,
    confirmation,
    actorId,
  ]);
  return rows[0].result;
}

async function purgeError(scope, confirmation, actorId) {
  try {
    await purge(scope, confirmation, actorId);
    return { threw: false, code: null };
  } catch (error) {
    return { threw: true, code: error?.code ?? null };
  }
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
    'select coalesce(total_points, 0) as points from public.group_scores where group_id = $1',
    [groupId],
  );
  return rows[0] ? rows[0].points : 0;
}

async function createGroup(name) {
  const { rows } = await pool.query(
    `insert into public.groups (name, color, active) values ($1, '#336699', true) returning id`,
    [`${name}-${suffix}`],
  );
  created.groups[name] = rows[0].id;
  return rows[0].id;
}

async function createStudent(name, groupId) {
  const { rows } = await pool.query(
    `insert into public.students (name, group_id, active) values ($1, $2, true) returning id`,
    [`${name}-${suffix}`, groupId],
  );
  created.students[name] = rows[0].id;
  return rows[0].id;
}

async function setup() {
  const settingsRes = await pool.query('select * from public.competition_settings where id = true');
  savedSettings = settingsRes.rows[0];
  await setSettings({
    penalty_enabled: false,
    penalty_points: 0,
    penalty_mode: 'per_property',
    allow_negative_score: false,
    css_speed_bonus_points: 0,
    css_speed_bonus_seconds: 120,
  });

  const admin = await pool.query(
    `insert into public.admin_users (email, password_hash) values ($1, 'x') returning id`,
    [`purge-test-${suffix}@example.com`],
  );
  created.adminId = admin.rows[0].id;

  // Ejercicio de códigos (para la tabla `submissions`).
  const codeExercise = await pool.query(
    `insert into public.exercises (title, description, points, kind, active, archived)
     values ($1, '', 100, 'code', true, false) returning id`,
    [`Purge Code ${suffix}`],
  );
  created.codeExerciseId = codeExercise.rows[0].id;
  created.exerciseIds.push(created.codeExerciseId);

  // Ejercicio CSS con selectores y reglas.
  const cssExercise = await pool.query(
    `insert into public.exercises (title, description, points, kind, active, archived)
     values ($1, '', 100, 'css', true, false) returning id`,
    [`Purge CSS ${suffix}`],
  );
  const cssId = cssExercise.rows[0].id;
  created.exerciseIds.push(cssId);
  created.cssExerciseId = cssId;

  for (const [key, selector, position] of [
    ['a', '.a', 0],
    ['b', '.b', 1],
  ]) {
    const { rows } = await pool.query(
      `insert into public.exercise_selectors (exercise_id, selector, position, active)
       values ($1, $2, $3, true) returning id`,
      [cssId, selector, position],
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

  const g1 = await createGroup('P1');
  const g2 = await createGroup('P2');

  // Código de acceso simulado en P1 (debe sobrevivir a la purga de alumnos).
  await pool.query(
    `update public.groups
     set access_code_lookup = $2, access_code_hash = $3, access_code_encrypted = $4
     where id = $1`,
    [g1, 'lookup-simulado', 'hash-simulado', 'cifrado-simulado'],
  );

  await createStudent('S1', g1);
  await createStudent('S2', g2);

  // Resolución del juego de códigos (historial previo, 100 puntos a P1).
  await pool.query(
    `insert into public.submissions (student_id, group_id, exercise_id, awarded_points)
     values ($1, $2, $3, 100)`,
    [created.students.S1, g1, created.codeExerciseId],
  );

  // Competición CSS abierta con actividad de P1 (50) y P2 (50).
  const round = await pool.query(
    `insert into public.competition_rounds (exercise_id) values ($1) returning id`,
    [cssId],
  );
  created.roundIds.push(round.rows[0].id);
  await submit(g1, created.selectors.a, [{ property: 'color', value: 'red' }]);
  await submit(g2, created.selectors.a, [{ property: 'color', value: 'red' }]);
}

async function cleanup() {
  try {
    for (const roundId of created.roundIds) {
      await pool.query('delete from public.competition_rounds where id = $1', [roundId]);
    }
    for (const exerciseId of created.exerciseIds) {
      await pool.query('delete from public.exercises where id = $1', [exerciseId]);
    }
    // Restos por si una prueba falló antes de purgar.
    for (const groupId of Object.values(created.groups)) {
      await pool.query('delete from public.submissions where group_id = $1', [groupId]);
      await pool.query('delete from public.groups where id = $1', [groupId]);
    }
    for (const studentId of Object.values(created.students)) {
      await pool.query('delete from public.submissions where student_id = $1', [studentId]);
      await pool.query('delete from public.students where id = $1', [studentId]);
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
  } catch (error) {
    console.error('Error durante la limpieza:', error);
  }
}

async function run() {
  // Guardia de seguridad: no destruir datos reales.
  const pre = { groups: await count('groups'), students: await count('students') };
  if (pre.groups > 0 || pre.students > 0) {
    console.error(
      `\n✖ ABORTADO: la base de datos ya tiene ${pre.groups} grupos y ${pre.students} alumnos.`,
    );
    console.error('  La purga es global. Ejecuta esta prueba solo contra una base de datos vacía.');
    process.exitCode = 1;
    return;
  }
  const preRounds = await count('competition_rounds');
  const preExercises = await count('exercises');
  const preSelectors = await count('exercise_selectors');
  const preRules = await count('selector_rules');

  await setup();
  const g1 = created.groups.P1;
  const g2 = created.groups.P2;

  // ==========================================================================
  // 2 y 3. Autorización y confirmación (nada cambia).
  // ==========================================================================
  const unauthorized = await purgeError('groups', CONFIRMATIONS.groups, randomUUID());
  check(
    '2. Un actor que no es administrador no puede eliminar (42501)',
    unauthorized.threw && unauthorized.code === '42501',
    `code=${unauthorized.code}`,
  );

  for (const scope of ['groups', 'students', 'both']) {
    const wrong = await purgeError(scope, 'Frase incorrecta', created.adminId);
    const lower = await purgeError(scope, CONFIRMATIONS[scope].toLowerCase(), created.adminId);
    check(
      `3. ${scope}: una confirmación incorrecta (o en minúsculas) impide la operación (22023)`,
      wrong.threw && wrong.code === '22023' && lower.threw && lower.code === '22023',
      `wrong=${wrong.code} lower=${lower.code}`,
    );
  }

  const badScope = await purgeError('everything', 'X', created.adminId);
  check(
    '3. Un ámbito no válido es rechazado (22023)',
    badScope.threw && badScope.code === '22023',
    `code=${badScope.code}`,
  );

  check(
    '3. Tras los intentos no autorizados/incorrectos no se ha borrado nada',
    (await count('groups')) === 2 &&
      (await count('students')) === 2 &&
      (await count('submissions')) === 1,
    `grupos=${await count('groups')} alumnos=${await count('students')} resoluciones=${await count('submissions')}`,
  );

  // ==========================================================================
  // 5 y 4. Eliminar alumnos: se calculan recuentos y se conservan grupos/competiciones.
  // ==========================================================================
  const studentsBefore = await count('students');
  const submissionsBefore = await count('submissions');
  const roundsBefore = await count('competition_rounds');
  const cssEventsBefore = await count('scoring_events');

  const studentsResult = await purge('students', CONFIRMATIONS.students, created.adminId);
  check(
    '4. Los recuentos los calcula el servidor (coinciden con la base de datos)',
    studentsResult.studentsDeleted === studentsBefore &&
      studentsResult.submissionsDeleted === submissionsBefore &&
      studentsResult.scoringEventsDeleted === 0,
    `resultado=${JSON.stringify(studentsResult)}`,
  );
  check(
    '1. El administrador elimina todos los alumnos (borrado real)',
    (await count('students')) === 0 && (await count('submission_attempts')) === 0,
    `alumnos=${await count('students')}`,
  );
  check(
    '5. Eliminar alumnos NO elimina los grupos (con sus códigos de acceso)',
    (await count('groups')) === 2 &&
      (
        await pool.query(
          'select 1 from public.groups where id = $1 and access_code_lookup = $2 and access_code_encrypted = $3',
          [g1, 'lookup-simulado', 'cifrado-simulado'],
        )
      ).rows.length === 1,
    `grupos=${await count('groups')}`,
  );
  check(
    '5. Eliminar alumnos NO elimina las competiciones ni su puntuación CSS',
    (await count('competition_rounds')) === roundsBefore &&
      (await count('scoring_events')) === cssEventsBefore,
    `rondas=${await count('competition_rounds')} eventos=${await count('scoring_events')}`,
  );
  check(
    '5. El marcador de los grupos se recalcula sin los puntos de las resoluciones borradas',
    (await globalBalance(g1)) === 50 && (await globalBalance(g2)) === 50,
    `P1=${await globalBalance(g1)} P2=${await globalBalance(g2)}`,
  );
  check(
    '9. Repetir la purga de alumnos no falla ni altera nada',
    (await purge('students', CONFIRMATIONS.students, created.adminId)).studentsDeleted === 0 &&
      (await count('groups')) === 2,
  );

  // ==========================================================================
  // 6 y 10. Eliminar grupos: se conservan ejercicios y competiciones.
  // ==========================================================================
  await createStudent('S3', g1);
  const preserve = {
    exercises: await count('exercises'),
    selectors: await count('exercise_selectors'),
    rules: await count('selector_rules'),
    rounds: await count('competition_rounds'),
  };

  const groupsResult = await purge('groups', CONFIRMATIONS.groups, created.adminId);
  check(
    '1. El administrador elimina todos los grupos (borrado real)',
    groupsResult.groupsDeleted === 2 && (await count('groups')) === 0,
    `resultado=${JSON.stringify(groupsResult)}`,
  );
  check(
    '6. Eliminar grupos NO elimina los ejercicios ni sus soluciones',
    (await count('exercises')) === preserve.exercises &&
      (await count('exercise_selectors')) === preserve.selectors &&
      (await count('selector_rules')) === preserve.rules,
    `ejercicios=${await count('exercises')} selectores=${await count('exercise_selectors')} reglas=${await count('selector_rules')}`,
  );
  check(
    '6/10. Las competiciones registradas se conservan (sin resultados colgando)',
    (await count('competition_rounds')) === preserve.rounds &&
      (await count('scoring_events')) === 0 &&
      (await count('group_property_scores')) === 0 &&
      (await count('competition_participants')) === 0,
    `rondas=${await count('competition_rounds')} eventos=${await count('scoring_events')}`,
  );
  check(
    '6. Los alumnos se conservan al eliminar solo los grupos, pero sin grupo',
    (await count('students')) === 1 &&
      (
        await pool.query('select group_id from public.students where id = $1', [
          created.students.S3,
        ])
      ).rows[0].group_id === null,
  );

  // ==========================================================================
  // 7. La operación combinada se revierte por completo ante un error.
  // ==========================================================================
  await createGroup('P3');
  await createGroup('P4');
  await createStudent('S4', created.groups.P3);

  await pool.query(`
    create or replace function public._purge_test_block()
    returns trigger language plpgsql as $$
    begin
      raise exception 'bloqueo de prueba' using errcode = 'P0001';
    end;
    $$;
  `);
  await pool.query(
    `create trigger _purge_test_block before delete on public.students
     for each row execute function public._purge_test_block();`,
  );

  const atomic = await purgeError('both', CONFIRMATIONS.both, created.adminId);
  await pool.query('drop trigger if exists _purge_test_block on public.students');
  await pool.query('drop function if exists public._purge_test_block()');
  check(
    '7. Si falla a mitad, la operación combinada se revierte por completo',
    atomic.threw &&
      (await count('groups')) === 2 &&
      (await count('students')) === 2 &&
      (
        await pool.query('select group_id from public.students where id = $1', [
          created.students.S4,
        ])
      ).rows[0].group_id === created.groups.P3,
    `threw=${atomic.threw} grupos=${await count('groups')} alumnos=${await count('students')}`,
  );

  // ==========================================================================
  // 1 y 9. Operación combinada satisfactoria y repetible.
  // ==========================================================================
  const bothResult = await purge('both', CONFIRMATIONS.both, created.adminId);
  check(
    '1. El administrador vacía grupos y alumnos en una sola operación',
    bothResult.groupsDeleted === 2 &&
      bothResult.studentsDeleted === 2 &&
      (await count('groups')) === 0 &&
      (await count('students')) === 0,
    `resultado=${JSON.stringify(bothResult)}`,
  );
  check(
    '9. Repetir la operación combinada no falla ni provoca inconsistencias',
    (await purge('both', CONFIRMATIONS.both, created.adminId)).groupsDeleted === 0 &&
      (await count('groups')) === 0 &&
      (await count('students')) === 0,
  );

  // ==========================================================================
  // 8. Integridad referencial intacta.
  // ==========================================================================
  let fkViolation = false;
  try {
    await pool.query(
      `insert into public.submissions (student_id, group_id, exercise_id, awarded_points)
       values ($1, $2, $3, 10)`,
      [randomUUID(), g1, created.codeExerciseId],
    );
  } catch (error) {
    fkViolation = error?.code === '23503';
  }
  check(
    '8. Las claves foráneas siguen vigentes (no se aceptan referencias huérfanas)',
    fkViolation,
  );

  // ==========================================================================
  // 10. Datos que deben conservarse.
  // ==========================================================================
  const finalExercises = await count('exercises');
  const finalRounds = await count('competition_rounds');
  check(
    '10. Los ejercicios y competiciones previos siguen disponibles',
    finalExercises === preExercises + created.exerciseIds.length &&
      (await count('exercise_selectors')) === preSelectors + 2 &&
      (await count('selector_rules')) === preRules + 3 &&
      finalRounds === preRounds + created.roundIds.length,
    `ejercicios=${finalExercises} (previos=${preExercises}) rondas=${finalRounds} (previas=${preRounds})`,
  );

  const audit = await pool.query(
    `select count(*)::int as n from public.audit_log
     where actor_id = $1 and action in
       ('purge_all_groups','purge_all_students','purge_groups_and_students')`,
    [created.adminId],
  );
  check(
    '10. La operación queda auditada (actor, tipo y recuentos)',
    audit.rows[0].n >= 3,
    `entradas=${audit.rows[0].n}`,
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
  console.error('Error inesperado en las pruebas de mantenimiento:', error);
  exitCode = 1;
} finally {
  await cleanup();
  await pool.end();
}
process.exit(exitCode);
