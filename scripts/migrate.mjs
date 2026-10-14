#!/usr/bin/env node
/**
 * Aplica las migraciones SQL versionadas de `database/migrations/`.
 *
 * - Crea la tabla `schema_migrations` (versión, nombre, fecha) si no existe.
 * - Aplica cada `*.sql` pendiente dentro de una transacción y registra la
 *   versión solo si terminó correctamente (nunca se aplica dos veces).
 * - Usa `pg_advisory_lock` para impedir ejecuciones simultáneas.
 *
 * Uso:
 *   npm run db:migrate
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'database', 'migrations');
const LOCK_KEY = 2718281828; // clave de advisory lock (int8)

if (existsSync(join(ROOT, '.env')) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(join(ROOT, '.env'));
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL. Copia .env.example a .env y complétala.');
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

function logOk(message) {
  console.log(`  ✔ ${message}`);
}

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.error(`No hay migraciones en ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);

    await client.query(`
      create table if not exists public.schema_migrations (
        version text primary key,
        name text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const { rows } = await client.query('select version from public.schema_migrations');
    const applied = new Set(rows.map((row) => row.version));

    let appliedCount = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/i, '');
      if (applied.has(version)) {
        console.log(`  = ${version} (ya aplicada)`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query(
          'insert into public.schema_migrations (version, name) values ($1, $2)',
          [version, file],
        );
        await client.query('commit');
        logOk(`${version} aplicada (${file})`);
        appliedCount += 1;
      } catch (error) {
        await client.query('rollback');
        console.error(`\n✖ Falló la migración ${version}:`, error.message ?? error);
        if (error.filename && error.position) {
          const lines = sql.slice(0, Number(error.position)).split('\n');
          console.error(`  En el archivo ${error.filename}, línea ${lines.length}.`);
        }
        process.exitCode = 1;
        return;
      }
    }

    console.log(
      appliedCount === 0
        ? '\nNo había migraciones nuevas.'
        : `\nMigraciones aplicadas correctamente: ${appliedCount}.`,
    );
  } finally {
    try {
      await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
    } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error('Error inesperado:', error);
  process.exit(1);
});