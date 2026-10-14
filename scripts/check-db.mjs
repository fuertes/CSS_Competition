#!/usr/bin/env node
/**
 * Comprueba la conexión a PostgreSQL y el estado de las migraciones.
 *
 * Uso:
 *   npm run db:check
 */
import { existsSync } from 'node:fs';
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

const pool = new Pool({ connectionString, max: 1 });

const REQUIRED_TABLES = [
  'app_secrets',
  'admin_users',
  'admin_sessions',
  'groups',
  'students',
  'exercises',
  'submissions',
  'group_scores',
  'submission_attempts',
  'audit_log',
  'competition_settings',
  'schema_migrations',
  // Competición CSS (migración 0005).
  'group_sessions',
  'group_login_attempts',
  'exercise_selectors',
  'selector_rules',
  'group_property_scores',
  'group_attempts',
  'scoring_events',
  'group_selector_bonuses',
  'competition_rounds',
  // Penalización e idempotencia (migración 0008).
  'css_submission_requests',
  // Participación explícita por competición (migración 0012).
  'competition_participants',
];

async function main() {
  const version = await pool.query('select current_setting(\'server_version\') as version');
  console.log(`PostgreSQL ${version.rows[0].version}`);

  const migrations = await pool.query(
    'select version, applied_at from public.schema_migrations order by version',
  );
  console.log('\nMigraciones registradas:');
  for (const row of migrations.rows) {
    console.log(`  ${row.version}  (${row.applied_at})`);
  }

  const tables = await pool.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  const present = new Set(tables.rows.map((row) => row.tablename));
  const missing = REQUIRED_TABLES.filter((table) => !present.has(table));

  console.log('\nTablas esperadas:');
  for (const table of REQUIRED_TABLES) {
    console.log(`  ${present.has(table) ? '✔' : '✖'} ${table}`);
  }

  const functions = await pool.query(
    `select proname from pg_proc
     join pg_namespace n on n.oid = pronamespace
     where n.nspname = 'public' and proname in
       ('submit_exercise_code','student_portal','set_exercise_code',
        'set_student_access_code','confirm_assignment','correct_assignment',
        'clear_assignment','hash_lookup','generate_group_code',
        'groups_assign_code',
        'generate_group_access_code','group_login','submit_css_selector',
        'start_competition_round','end_competition_round','on_scoring_event_created',
        'round_ranking','on_competition_round_created',
        'delete_competition_round','recompute_group_scores',
        'purge_entities')
     order by proname`,
  );
  const fnNames = new Set(functions.rows.map((row) => row.proname));
  const expectedFunctions = [
    'submit_exercise_code',
    'student_portal',
    'set_exercise_code',
    'set_student_access_code',
    'confirm_assignment',
    'correct_assignment',
    'clear_assignment',
    'hash_lookup',
    'generate_group_code',
    'groups_assign_code',
    'generate_group_access_code',
    'group_login',
    'submit_css_selector',
    'start_competition_round',
    'end_competition_round',
    'on_scoring_event_created',
    'round_ranking',
    'on_competition_round_created',
    'delete_competition_round',
    'recompute_group_scores',
    'purge_entities',
  ];
  const missingFunctions = expectedFunctions.filter((name) => !fnNames.has(name));

  console.log('\nFunciones esenciales:');
  for (const name of expectedFunctions) {
    console.log(`  ${fnNames.has(name) ? '✔' : '✖'} ${name}`);
  }

  // Código único por grupo (migración 0004).
  const groupColumns = await pool.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'groups'`,
  );
  const hasGroupCode = groupColumns.rows.some((row) => row.column_name === 'code');
  const groupUnique = await pool.query(
    `select count(*)::int as n from pg_constraint
     where contype = 'u' and conrelid = 'public.groups'::regclass and conname = 'groups_code_unique'`,
  );
  const hasGroupCodeUnique = groupUnique.rows[0]?.n > 0;

  console.log('\nCódigo de grupo (migración 0004):');
  console.log(`  ${hasGroupCode ? '✔' : '✖'} columna groups.code`);
  console.log(`  ${hasGroupCodeUnique ? '✔' : '✖'} restricción groups_code_unique`);

  // Competición CSS (migración 0005).
  const groupCols = await pool.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'groups'`,
  );
  const groupColNames = new Set(groupCols.rows.map((row) => row.column_name));
  const hasAccessLookup = groupColNames.has('access_code_lookup');
  const hasAccessHash = groupColNames.has('access_code_hash');
  const hasAccessEncrypted = groupColNames.has('access_code_encrypted');
  const accessLookupUnique = await pool.query(
    `select count(*)::int as n from pg_indexes
     where schemaname = 'public' and indexname = 'groups_access_code_lookup_key'`,
  );
  const hasAccessLookupUnique = accessLookupUnique.rows[0]?.n > 0;

  const exerciseCols = await pool.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'exercises'`,
  );
  const hasExerciseKind = exerciseCols.rows.some((row) => row.column_name === 'kind');

  const settingsCols = await pool.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'competition_settings'`,
  );
  const settingsColNames = new Set(settingsCols.rows.map((row) => row.column_name));
  const cssSettings = [
    'css_login_max_attempts',
    'css_login_window_seconds',
    'css_speed_bonus_points',
    'css_speed_bonus_seconds',
  ];
  const missingCssSettings = cssSettings.filter((name) => !settingsColNames.has(name));

  // Penalización configurable (migraciones 0008 y 0009).
  const penaltySettings = [
    'penalty_enabled',
    'penalty_points',
    'penalty_mode',
    'allow_negative_score',
    'css_points_per_property',
  ];
  const missingPenaltySettings = penaltySettings.filter((name) => !settingsColNames.has(name));

  const attemptCols = await pool.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'group_attempts'`,
  );
  const attemptColNames = new Set(attemptCols.rows.map((row) => row.column_name));
  const attemptAudit = ['penalty_points', 'net_points', 'new_properties', 'request_id'];
  const missingAttemptAudit = attemptAudit.filter((name) => !attemptColNames.has(name));

  const requestIdUnique = await pool.query(
    `select count(*)::int as n from pg_constraint
     where conrelid = 'public.css_submission_requests'::regclass and contype = 'p'`,
  );
  const hasRequestIdPk = requestIdUnique.rows[0]?.n > 0;

  const singleOpen = await pool.query(
    `select count(*)::int as n from pg_indexes
     where schemaname = 'public' and indexname = 'competition_rounds_single_open'`,
  );
  const hasSingleOpen = singleOpen.rows[0]?.n > 0;

  // Aislamiento por competición (migración 0011): la unidad de corrección pasa a
  // incluir la competición (round_id) y se apoya en índices únicos parciales.
  const roundScopedColumns = await pool.query(
    `select a.attname::text as col
     from pg_index i
     join pg_class c on c.oid = i.indexrelid
     cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where c.relname = 'group_property_scores_round_unique' and i.indisunique
     order by k.ord`,
  );
  const roundScopedCols = roundScopedColumns.rows.map((row) => row.col);
  const expectedRoundScoreKey = [
    'round_id',
    'group_id',
    'exercise_id',
    'selector_id',
    'property_name',
  ];
  const hasRoundScopedUnique =
    roundScopedCols.length === expectedRoundScoreKey.length &&
    expectedRoundScoreKey.every((column, index) => roundScopedCols[index] === column);

  const legacyUnique = await pool.query(
    `select count(*)::int as n from pg_indexes
     where schemaname = 'public' and indexname = 'group_property_scores_legacy_unique'`,
  );
  const hasLegacyUnique = legacyUnique.rows[0]?.n > 0;

  const bonusRoundUnique = await pool.query(
    `select count(*)::int as n from pg_indexes
     where schemaname = 'public' and indexname = 'group_selector_bonuses_round_unique'`,
  );
  const hasBonusRoundUnique = bonusRoundUnique.rows[0]?.n > 0;

  const roundIdTables = await pool.query(
    `select table_name as tablename from information_schema.columns
     where table_schema = 'public' and column_name = 'round_id'`,
  );
  const roundIdTableSet = new Set(roundIdTables.rows.map((row) => row.tablename));
  const expectedRoundIdTables = [
    'scoring_events',
    'group_property_scores',
    'group_attempts',
    'group_selector_bonuses',
  ];
  const missingRoundIdTables = expectedRoundIdTables.filter((table) => !roundIdTableSet.has(table));

  const roundRankingFn = await pool.query(
    `select count(*)::int as n from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'round_ranking'`,
  );
  const hasRoundRanking = roundRankingFn.rows[0]?.n > 0;

  const selectorExerciseFk = await pool.query(
    `select count(*)::int as n from pg_constraint
     where conrelid = 'public.group_property_scores'::regclass
       and conname = 'group_property_scores_selector_exercise_fk'
       and contype = 'f'`,
  );
  const hasSelectorExerciseFk = selectorExerciseFk.rows[0]?.n > 0;

  // Participación explícita por competición (migración 0012): tabla de
  // participantes y disparador que la rellena al iniciar una competición.
  const participantsPk = await pool.query(
    `select count(*)::int as n from pg_constraint
     where conrelid = 'public.competition_participants'::regclass and contype = 'p'`,
  );
  const hasParticipantsPk = participantsPk.rows[0]?.n > 0;

  const participantsTrigger = await pool.query(
    `select count(*)::int as n from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     where c.relname = 'competition_rounds'
       and t.tgname = 'competition_rounds_participants'
       and not t.tgisinternal`,
  );
  const hasParticipantsTrigger = participantsTrigger.rows[0]?.n > 0;

  // Regresión (migración 0007): el generador de códigos de acceso debe producir
  // siempre 8 caracteres del alfabeto seguro (sin I, O, 0 ni 1).
  const accessCodes = await pool.query(
    `select count(*) as total,
            count(*) filter (where length(code) <> 8) as wrong_length,
            count(*) filter (
              where translate(code, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', '') <> ''
            ) as bad_chars
     from (select public.generate_group_access_code() as code from generate_series(1, 200)) t`,
  );
  const codesTotal = Number(accessCodes.rows[0]?.total ?? 0);
  const codesWrongLength = Number(accessCodes.rows[0]?.wrong_length ?? 0);
  const codesBadChars = Number(accessCodes.rows[0]?.bad_chars ?? 0);
  const codesOk = codesTotal > 0 && codesWrongLength === 0 && codesBadChars === 0;

  console.log('\nCompetición CSS (migración 0005):');
  console.log(`  ${hasAccessLookup && hasAccessHash ? '✔' : '✖'} columnas groups.access_code_lookup/hash`);
  console.log(`  ${hasAccessLookupUnique ? '✔' : '✖'} índice único groups_access_code_lookup_key`);
  console.log(`  ${hasExerciseKind ? '✔' : '✖'} columna exercises.kind`);
  console.log(`  ${missingCssSettings.length === 0 ? '✔' : '✖'} columnas de configuración CSS`);
  console.log(`  ${hasSingleOpen ? '✔' : '✖'} índice competition_rounds_single_open`);
  console.log(
    `  ${hasRoundScopedUnique ? '✔' : '✖'} unicidad por competición (round_id, grupo, ejercicio, selector, propiedad)`,
  );
  console.log(`  ${hasLegacyUnique ? '✔' : '✖'} unicidad histórica de group_property_scores (sin ronda)`);
  console.log(`  ${hasBonusRoundUnique ? '✔' : '✖'} unicidad de bonificación por competición`);
  console.log(`  ${hasSelectorExerciseFk ? '✔' : '✖'} FK compuesta selector↔ejercicio`);

  console.log('\nCódigo de acceso de grupo (migración 0007):');
  console.log(
    `  ${codesOk ? '✔' : '✖'} generate_group_access_code produce 8 caracteres seguros (${codesTotal} muestras)`,
  );

  console.log('\nPenalización configurable (migraciones 0008 y 0009):');
  console.log(
    `  ${missingPenaltySettings.length === 0 ? '✔' : '✖'} columnas de penalización en competition_settings`,
  );
  console.log(
    `  ${missingAttemptAudit.length === 0 ? '✔' : '✖'} columnas de auditoría en group_attempts`,
  );
  console.log(`  ${hasRequestIdPk ? '✔' : '✖'} tabla css_submission_requests con clave primaria`);

  console.log('\nAislamiento por competición (migración 0011):');
  console.log(
    `  ${missingRoundIdTables.length === 0 ? '✔' : '✖'} columnas round_id en los registros de puntuación`,
  );
  console.log(`  ${hasRoundRanking ? '✔' : '✖'} función round_ranking(round_id)`);

  console.log('\nParticipación por competición (migración 0012):');
  console.log(`  ${hasParticipantsPk ? '✔' : '✖'} tabla competition_participants con clave primaria`);
  console.log(
    `  ${hasParticipantsTrigger ? '✔' : '✖'} disparador competition_rounds_participants`,
  );

  console.log('\nBorrado de competiciones y código recuperable (migración 0013):');
  console.log(
    `  ${fnNames.has('delete_competition_round') ? '✔' : '✖'} función delete_competition_round(round_id, actor_id)`,
  );
  console.log(
    `  ${fnNames.has('recompute_group_scores') ? '✔' : '✖'} función recompute_group_scores(group_ids[])`,
  );
  console.log(
    `  ${hasAccessEncrypted ? '✔' : '✖'} columna groups.access_code_encrypted (código recuperable)`,
  );

  console.log('\nMantenimiento de datos (migración 0014):');
  console.log(
    `  ${fnNames.has('purge_entities') ? '✔' : '✖'} función purge_entities(scope, confirmation, actor_id)`,
  );

  const healthy =
    missing.length === 0 &&
    missingFunctions.length === 0 &&
    hasGroupCode &&
    hasGroupCodeUnique &&
    hasAccessLookup &&
    hasAccessHash &&
    hasAccessEncrypted &&
    hasAccessLookupUnique &&
    hasExerciseKind &&
    missingCssSettings.length === 0 &&
    missingPenaltySettings.length === 0 &&
    missingAttemptAudit.length === 0 &&
    hasRequestIdPk &&
    hasSingleOpen &&
    hasRoundScopedUnique &&
    hasLegacyUnique &&
    hasBonusRoundUnique &&
    missingRoundIdTables.length === 0 &&
    hasRoundRanking &&
    hasSelectorExerciseFk &&
    hasParticipantsPk &&
    hasParticipantsTrigger &&
    codesOk &&
    fnNames.has('purge_entities') &&
    migrations.rows.length > 0;

  console.log(`\nResultado: ${healthy ? 'CONEXIÓN Y ESQUEMA CORRECTOS ✔' : 'REVISA LA CONFIGURACIÓN ✖'}`);
  if (!healthy) {
    if (missing.length > 0) console.error(`  Faltan tablas: ${missing.join(', ')}`);
    if (missingFunctions.length > 0) {
      console.error(`  Faltan funciones: ${missingFunctions.join(', ')}`);
    }
    if (!hasGroupCode) console.error('  Falta la columna groups.code.');
    if (!hasGroupCodeUnique) console.error('  Falta la restricción groups_code_unique.');
    if (!hasAccessLookup || !hasAccessHash) console.error('  Faltan columnas de código de acceso de grupo.');
    if (!hasAccessEncrypted) console.error('  Falta la columna groups.access_code_encrypted (migración 0013).');
    if (!hasAccessLookupUnique) console.error('  Falta el índice groups_access_code_lookup_key.');
    if (!hasExerciseKind) console.error('  Falta la columna exercises.kind.');
    if (missingCssSettings.length > 0) {
      console.error(`  Faltan columnas de configuración CSS: ${missingCssSettings.join(', ')}`);
    }
    if (missingPenaltySettings.length > 0) {
      console.error(`  Faltan columnas de penalización: ${missingPenaltySettings.join(', ')}`);
    }
    if (missingAttemptAudit.length > 0) {
      console.error(`  Faltan columnas de auditoría en group_attempts: ${missingAttemptAudit.join(', ')}`);
    }
    if (!hasRequestIdPk) console.error('  Falta la tabla css_submission_requests (idempotencia).');
    if (!hasSingleOpen) console.error('  Falta el índice competition_rounds_single_open.');
    if (!hasRoundScopedUnique) {
      console.error(
        '  Falta el índice group_property_scores_round_unique (round_id, group_id, exercise_id, selector_id, property_name).',
      );
    }
    if (!hasLegacyUnique) {
      console.error('  Falta el índice group_property_scores_legacy_unique (histórico sin ronda).');
    }
    if (!hasBonusRoundUnique) {
      console.error('  Falta el índice group_selector_bonuses_round_unique.');
    }
    if (missingRoundIdTables.length > 0) {
      console.error(`  Faltan columnas round_id en: ${missingRoundIdTables.join(', ')}.`);
    }
    if (!hasRoundRanking) console.error('  Falta la función round_ranking(round_id).');
    if (!hasSelectorExerciseFk) {
      console.error('  Falta la FK compuesta group_property_scores (selector_id, exercise_id).');
    }
    if (!hasParticipantsPk) {
      console.error('  Falta la tabla competition_participants (participación por competición).');
    }
    if (!hasParticipantsTrigger) {
      console.error('  Falta el disparador competition_rounds_participants.');
    }
    if (!codesOk) {
      console.error('  generate_group_access_code no produce códigos válidos de 8 caracteres (migración 0007).');
    }
    if (!fnNames.has('purge_entities')) {
      console.error('  Falta la función purge_entities (migración 0014).');
    }
    if (migrations.rows.length === 0) {
      console.error('  No hay migraciones registradas. Ejecuta `npm run db:migrate`.');
    }
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('\n✖ No se pudo conectar a PostgreSQL:');
    console.error(`  ${error.message ?? error}`);
    console.error('\nComprueba que el contenedor esté levantado (npm run db:up) y que DATABASE_URL sea correcta.');
    process.exit(1);
  })
  .finally(() => pool.end());