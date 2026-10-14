#!/usr/bin/env node
/**
 * Pruebas de integración del aislamiento de puntuación por competición
 * (solo base de datos).
 *
 * Cada competición es una ejecución (`competition_rounds`). Esta prueba
 * ejercita directamente `public.submit_css_selector` y `public.round_ranking`
 * (la fuente de verdad) con datos temporales que se limpian al terminar.
 * No necesita el servidor en marcha.
 *
 * Cubre la lista obligatoria:
 *   1. Un grupo sin historial empieza una competición con 0 puntos.
 *   2. Un grupo con 150 puntos en una competición anterior empieza la siguiente
 *      con 0 puntos.
 *   3. Obtener 40 puntos en la segunda competición muestra 40, no 190.
 *   4. La puntuación histórica de la primera competición permanece intacta.
 *   5. Una regla CSS puede volver a puntuar en una competición nueva.
 *   6. Una regla ya puntuada no vuelve a conceder puntos en la misma.
 *   7. Penalizaciones y bonificaciones de una competición no afectan a otra.
 *   8. La clasificación solo incluye los puntos de la competición seleccionada.
 *   9. Una petición retrasada de una competición anterior no modifica el actual.
 *  10. Un grupo que no participa no puede obtener puntos.
 *  11. Una competición finalizada no acepta nuevas entregas puntuables.
 *  12. Los reintentos y las solicitudes concurrentes no duplican puntuaciones.
 *  13. Las puntuaciones históricas (sin competición determinable) sobreviven.
 *
 * Uso:
 *   npm run db:competition
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
const created = { groups: {}, exerciseId: null, selectors: {}, rounds: [] };
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

async function submit(groupId, selectorId, declarations, requestId = null) {
  const { rows } = await pool.query(
    'select public.submit_css_selector($1, $2, $3::jsonb, $4) as result',
    [groupId, selectorId, JSON.stringify(declarations), requestId],
  );
  return rows[0].result;
}

/** Puntos de un grupo dentro de una competición concreta. */
async function roundTotal(roundId, groupId) {
  const { rows } = await pool.query(
    'select total_points from public.round_ranking($1) where group_id = $2',
    [roundId, groupId],
  );
  return rows[0]?.total_points ?? null;
}

/** Puntos acumulados históricos (todas las competiciones). */
async function globalBalance(groupId) {
  const { rows } = await pool.query(
    'select coalesce(total_points, 0) as points from public.group_scores where group_id = $1',
    [groupId],
  );
  return rows[0]?.points ?? 0;
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

async function endRound(roundId) {
  await pool.query('update public.competition_rounds set ended_at = now() where id = $1', [roundId]);
}

async function createGroup(name, active) {
  const { rows } = await pool.query(
    `insert into public.groups (name, color, active) values ($1, '#336699', $2) returning id`,
    [name, active],
  );
  const id = rows[0].id;
  created.groups[name] = id;
  return id;
}

async function setup() {
  const settingsRes = await pool.query('select * from public.competition_settings where id = true');
  savedSettings = settingsRes.rows[0];

  const openRes = await pool.query('select id from public.competition_rounds where ended_at is null');
  savedOpenRounds = openRes.rows.map((row) => row.id);
  if (savedOpenRounds.length > 0) {
    await pool.query('update public.competition_rounds set ended_at = now() where ended_at is null');
  }

  // Desactiva la penalización y el bonus salvo en las fases que los prueban.
  await setSettings({
    penalty_enabled: false,
    penalty_points: 0,
    penalty_mode: 'per_property',
    allow_negative_score: false,
    css_speed_bonus_points: 0,
    css_speed_bonus_seconds: 120,
  });

  const exercise = await pool.query(
    `insert into public.exercises (title, description, points, kind, active, archived)
     values ($1, '', 100, 'css', true, false) returning id`,
    [`Competition Isolation ${suffix}`],
  );
  created.exerciseId = exercise.rows[0].id;

  const selectorDefs = [
    ['a', '.a'],
    ['b', '.b'],
    ['c', '.c'],
  ];
  let position = 0;
  for (const [key, selector] of selectorDefs) {
    const { rows } = await pool.query(
      `insert into public.exercise_selectors (exercise_id, selector, position, active)
       values ($1, $2, $3, true) returning id`,
      [created.exerciseId, selector, position],
    );
    created.selectors[key] = rows[0].id;
    position += 1;
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
  await pool.query(
    `insert into public.selector_rules (selector_id, property_name, expected_canonical, points)
     values ($1, 'color', 'blue', 40)`,
    [created.selectors.c],
  );

  await createGroup('G1', true); // con historial en A
  await createGroup('G2', false); // no participa (inactivo)
  await createGroup('G3', true); // sin historial
}

async function cleanup() {
  try {
    if (created.exerciseId) {
      await pool.query('delete from public.competition_rounds where exercise_id = $1', [
        created.exerciseId,
      ]);
    }
    for (const groupId of Object.values(created.groups)) {
      await pool.query('delete from public.groups where id = $1', [groupId]);
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
  const g1 = created.groups.G1;
  const g2 = created.groups.G2;
  const g3 = created.groups.G3;

  // ==========================================================================
  // Fase 1 — Competición A: G1 obtiene 150 puntos.
  // ==========================================================================
  const roundA = await startRound(created.exerciseId);
  const reqA = randomUUID();

  // Participación explícita: al iniciar la competición se inscriben los grupos
  // activos en ese momento; el grupo inactivo queda fuera.
  const partA = await pool.query(
    'select group_id from public.competition_participants where round_id = $1',
    [roundA],
  );
  const participantSet = new Set(partA.rows.map((row) => row.group_id));
  check(
    '10. Al iniciar A se inscriben los grupos activos (G1, G3) y queda fuera el inactivo (G2)',
    participantSet.has(g1) && participantSet.has(g3) && !participantSet.has(g2),
    `participantes=${participantSet.size}`,
  );

  const a1 = await submit(g1, created.selectors.a, [{ property: 'color', value: 'red' }], reqA);
  const a2 = await submit(g1, created.selectors.a, [{ property: 'padding', value: '0px' }]);
  const a3 = await submit(g1, created.selectors.b, [{ property: 'color', value: 'red' }]);
  check(
    'Competición A: el grupo acumula 150 puntos',
    a1.awarded === 50 && a2.awarded === 50 && a3.awarded === 50,
    `a1=${a1.awarded} a2=${a2.awarded} a3=${a3.awarded}`,
  );
  check(
    'Competición A: la clasificación de la competición refleja 150',
    (await roundTotal(roundA, g1)) === 150,
    `total=${await roundTotal(roundA, g1)}`,
  );
  await endRound(roundA);

  // ==========================================================================
  // Fase 2 — Competición B: G1 empieza a 0; una regla vuelve a puntuar.
  // ==========================================================================
  const roundB = await startRound(created.exerciseId);

  // Grupo ACTIVO creado después de iniciar la competición: no forma parte del
  // roster de B, de modo que no puede obtener puntos en ella.
  const g4 = await createGroup('G4', true);

  check(
    '2. El grupo con 150 puntos en A empieza la competición B con 0',
    (await roundTotal(roundB, g1)) === 0,
    `total B=${await roundTotal(roundB, g1)}`,
  );
  check(
    '1. Un grupo sin historial empieza la competición con 0 puntos',
    (await roundTotal(roundB, g3)) === 0,
    `total B G3=${await roundTotal(roundB, g3)}`,
  );
  check(
    '4. La puntuación histórica de A (150) permanece intacta',
    (await roundTotal(roundA, g1)) === 150 && (await globalBalance(g1)) === 150,
    `A=${await roundTotal(roundA, g1)} global=${await globalBalance(g1)}`,
  );

  const b1 = await submit(g1, created.selectors.c, [{ property: 'color', value: 'blue' }]);
  check(
    '3. Obtener 40 puntos en B muestra 40 (no 190)',
    b1.awarded === 40 && (await roundTotal(roundB, g1)) === 40,
    `awarded=${b1.awarded} total B=${await roundTotal(roundB, g1)}`,
  );
  check(
    '4. El marcador global acumulado sigue conservando el histórico',
    (await globalBalance(g1)) === 190,
    `global=${await globalBalance(g1)}`,
  );

  const b2 = await submit(g1, created.selectors.a, [{ property: 'color', value: 'red' }]);
  check(
    '5. La misma regla (color:red en .a) vuelve a puntuar en la competición nueva',
    b2.awarded === 50 && b2.new_properties === 1,
    `awarded=${b2.awarded}`,
  );
  check(
    '8. La clasificación de B solo incluye los puntos de B',
    (await roundTotal(roundB, g1)) === 90,
    `total B=${await roundTotal(roundB, g1)}`,
  );

  const b3 = await submit(g1, created.selectors.a, [{ property: 'color', value: 'red' }]);
  check(
    '6. La misma regla no vuelve a puntuar dentro de la competición',
    b3.awarded === 0 && b3.new_properties === 0,
    `awarded=${b3.awarded}`,
  );

  const retryA = await submit(g1, created.selectors.a, [{ property: 'color', value: 'red' }], reqA);
  check(
    '9. Una petición retrasada de A devuelve su respuesta y no altera B',
    JSON.stringify(retryA) === JSON.stringify(a1) && (await roundTotal(roundB, g1)) === 90,
    `retry.awarded=${retryA.awarded} total B=${await roundTotal(roundB, g1)}`,
  );

  const scoreRows = await pool.query(
    `select round_id from public.group_property_scores
     where group_id = $1 and selector_id = $2 and property_name = 'color'
     order by round_id`,
    [g1, created.selectors.a],
  );
  check(
    '5. La regla color:red en .a queda registrada una vez por competición',
    scoreRows.rows.length === 2 &&
      new Set(scoreRows.rows.map((row) => row.round_id)).size === 2,
    `filas=${scoreRows.rows.length}`,
  );

  const inactive = await submit(g2, created.selectors.c, [{ property: 'color', value: 'blue' }]);
  check(
    '10. Un grupo que no participa (inactivo) no obtiene puntos',
    inactive.status === 'inactive_group' && (await roundTotal(roundB, g2)) === 0,
    `status=${inactive.status}`,
  );

  const outsider = await submit(g4, created.selectors.c, [{ property: 'color', value: 'blue' }]);
  const outsiderEvents = await pool.query(
    `select count(*)::int as n from public.scoring_events
     where group_id = $1 and round_id = $2`,
    [g4, roundB],
  );
  const outsiderScores = await pool.query(
    `select count(*)::int as n from public.group_property_scores
     where group_id = $1 and round_id = $2`,
    [g4, roundB],
  );
  check(
    '10. Un grupo activo que no participa en la competición no obtiene puntos en ella',
    outsider.status === 'not_participating' &&
      outsiderEvents.rows[0].n === 0 &&
      outsiderScores.rows[0].n === 0,
    `status=${outsider.status} eventos=${outsiderEvents.rows[0].n} puntuaciones=${outsiderScores.rows[0].n}`,
  );

  const g3Score = await submit(g3, created.selectors.c, [{ property: 'color', value: 'blue' }]);
  check(
    '8. Otro grupo sin historial puntúa de forma independiente',
    g3Score.awarded === 40 && (await roundTotal(roundB, g3)) === 40,
    `awarded=${g3Score.awarded}`,
  );

  // 12. Concurrencia: dos entregas simultáneas de la misma propiedad.
  const [c1, c2] = await Promise.all([
    submit(g3, created.selectors.a, [{ property: 'color', value: 'red' }]),
    submit(g3, created.selectors.a, [{ property: 'color', value: 'red' }]),
  ]);
  check(
    '12. Dos entregas concurrentes de la misma regla → solo una puntúa',
    (c1.awarded ?? 0) + (c2.awarded ?? 0) === 50 && (await roundTotal(roundB, g3)) === 90,
    `total=${(c1.awarded ?? 0) + (c2.awarded ?? 0)} rank=${await roundTotal(roundB, g3)}`,
  );

  check(
    '4. La competición A sigue intacta tras toda la actividad en B',
    (await roundTotal(roundA, g1)) === 150,
    `A=${await roundTotal(roundA, g1)}`,
  );

  await endRound(roundB);

  // 11. Competición finalizada: no acepta entregas puntuables.
  const afterB = await submit(g1, created.selectors.c, [{ property: 'color', value: 'blue' }]);
  check(
    '11. Una competición finalizada no acepta nuevas entregas puntuables',
    afterB.status === 'no_round',
    `status=${afterB.status}`,
  );

  // ==========================================================================
  // Fase 3 — Penalización aislada por competición.
  // ==========================================================================
  await setSettings({
    penalty_enabled: true,
    penalty_points: 1000,
    penalty_mode: 'per_property',
    allow_negative_score: false,
    css_speed_bonus_points: 0,
  });
  const roundP = await startRound(created.exerciseId);

  await submit(g1, created.selectors.a, [{ property: 'color', value: 'red' }]);
  const penalized = await submit(g1, created.selectors.a, [{ property: 'padding', value: '9px' }]);
  check(
    '7. La penalización se limita al saldo de ESTA competición (no usa A/B)',
    penalized.penalty === 50 && (await roundTotal(roundP, g1)) === 0,
    `penalty=${penalized.penalty} total P=${await roundTotal(roundP, g1)}`,
  );
  check(
    '7. Las penalizaciones de P no afectan a las competiciones A y B',
    (await roundTotal(roundA, g1)) === 150 && (await roundTotal(roundB, g1)) === 90,
    `A=${await roundTotal(roundA, g1)} B=${await roundTotal(roundB, g1)}`,
  );
  await endRound(roundP);

  // ==========================================================================
  // Fase 4 — Bonificación por velocidad aislada por competición.
  // ==========================================================================
  await setSettings({
    penalty_enabled: false,
    penalty_points: 0,
    css_speed_bonus_points: 20,
    css_speed_bonus_seconds: 3600,
  });
  const roundS = await startRound(created.exerciseId);

  await submit(g1, created.selectors.b, [{ property: 'color', value: 'blue' }]); // intento previo
  const bonusS = await submit(g1, created.selectors.b, [{ property: 'color', value: 'red' }]);
  check(
    '7. La bonificación por velocidad se concede dentro de su competición',
    bonusS.awarded === 70 && bonusS.speed_bonus === true && (await roundTotal(roundS, g1)) === 70,
    `awarded=${bonusS.awarded} bonus=${bonusS.speed_bonus}`,
  );
  const bonusRepeat = await submit(g1, created.selectors.b, [{ property: 'color', value: 'red' }]);
  const bonusRowsS = await pool.query(
    `select count(*)::int as n from public.group_selector_bonuses
     where group_id = $1 and selector_id = $2 and round_id = $3`,
    [g1, created.selectors.b, roundS],
  );
  check(
    '7. La bonificación no se repite dentro de la misma competición',
    bonusRepeat.speed_bonus === false && bonusRowsS.rows[0].n === 1,
    `bonus=${bonusRepeat.speed_bonus} filas=${bonusRowsS.rows[0].n}`,
  );

  // Nueva competición: la bonificación vuelve a poder concederse.
  const roundS2 = await startRound(created.exerciseId);
  await submit(g1, created.selectors.b, [{ property: 'color', value: 'blue' }]);
  const bonusS2 = await submit(g1, created.selectors.b, [{ property: 'color', value: 'red' }]);
  const bonusRowsTotal = await pool.query(
    `select count(*)::int as n from public.group_selector_bonuses
     where group_id = $1 and selector_id = $2`,
    [g1, created.selectors.b],
  );
  check(
    '7. Una competición nueva vuelve a permitir la bonificación (una por competición)',
    bonusS2.speed_bonus === true && bonusRowsTotal.rows[0].n === 2,
    `bonus=${bonusS2.speed_bonus} filas totales=${bonusRowsTotal.rows[0].n}`,
  );
  await endRound(roundS2);

  // ==========================================================================
  // Fase 5 — Histórico sin competición determinable (migración 0011).
  // ==========================================================================
  const legacySelector = created.selectors.c;
  await pool.query(
    `insert into public.group_property_scores (group_id, exercise_id, selector_id, property_name, points)
     values ($1, $2, $3, 'margin', 10)`,
    [g3, created.exerciseId, legacySelector],
  );
  await pool.query(
    `insert into public.scoring_events (group_id, exercise_id, selector_id, property_name, kind, points)
     values ($1, $2, $3, 'margin', 'property', 10)`,
    [g3, created.exerciseId, legacySelector],
  );
  const legacyRows = await pool.query(
    `select count(*)::int as n from public.group_property_scores
     where group_id = $1 and round_id is null and property_name = 'margin'`,
    [g3],
  );
  check(
    '13. Las puntuaciones históricas sin competición determinable se conservan',
    legacyRows.rows[0].n === 1,
    `filas=${legacyRows.rows[0].n}`,
  );

  let legacyDuplicateRejected = false;
  try {
    await pool.query(
      `insert into public.group_property_scores (group_id, exercise_id, selector_id, property_name, points)
       values ($1, $2, $3, 'margin', 10)`,
      [g3, created.exerciseId, legacySelector],
    );
  } catch {
    legacyDuplicateRejected = true;
  }
  check(
    '13. La unicidad histórica se mantiene para filas sin competición',
    legacyDuplicateRejected,
  );

  check(
    '13. Las filas históricas no se atribuyen a ninguna competición (sin inventar datos)',
    (await roundTotal(roundB, g3)) === 90,
    `rank B G3=${await roundTotal(roundB, g3)}`,
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
  console.error('Error inesperado en las pruebas de competición:', error);
  exitCode = 1;
} finally {
  await cleanup();
  await pool.end();
}
process.exit(exitCode);
