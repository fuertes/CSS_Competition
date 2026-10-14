#!/usr/bin/env node
/**
 * Crea o actualiza el primer administrador del panel.
 *
 * Lee las variables de entorno (`.env`): ADMIN_EMAIL, ADMIN_PASSWORD y
 * ADMIN_NAME (opcional). La contraseña se guarda hasheada con bcrypt
 * (pgcrypto: crypt + gen_salt), nunca en claro.
 *
 * Uso:
 *   npm run db:seed-admin
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
const email = (process.env.ADMIN_EMAIL ?? '').trim();
const password = process.env.ADMIN_PASSWORD ?? '';
const name = (process.env.ADMIN_NAME ?? '').trim() || null;

if (!connectionString) {
  console.error('Falta DATABASE_URL. Copia .env.example a .env y complétala.');
  process.exit(1);
}
if (!email || !password) {
  console.error('Faltan ADMIN_EMAIL y/o ADMIN_PASSWORD en .env (o en la línea de comandos).');
  process.exit(1);
}
if (password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

async function main() {
  const result = await pool.query(
    `insert into public.admin_users (email, password_hash, display_name)
     values ($1, crypt($2, gen_salt('bf', 12)), $3)
     on conflict (email) do update
       set password_hash = excluded.password_hash,
           display_name = excluded.display_name,
           updated_at = now()
     returning id, email`,
    [email.toLowerCase(), password, name],
  );

  const { id, email: storedEmail } = result.rows[0];
  console.log(`✔ Administrador listo: ${storedEmail} (${id})`);
  console.log('  Puedes entrar en http://localhost:3000/login');
}

main()
  .catch((error) => {
    console.error('✖ No se pudo crear el administrador:');
    console.error(`  ${error.message ?? error}`);
    console.error('  ¿Has ejecutado `npm run db:migrate`?');
    process.exit(1);
  })
  .finally(() => pool.end());