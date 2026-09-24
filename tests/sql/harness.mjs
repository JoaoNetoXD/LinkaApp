// Loads the Empreende iCEV schema and migrations into PGlite (Postgres in WebAssembly) with a
// small Supabase shim, so the SQL scripts run and can be exercised as anon, authenticated and
// service_role without a database server. Run: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = fileURLToPath(new URL('../..', import.meta.url));

const SHIM = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT auth.jwt() ->> 'role' $$;
GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
-- Supabase default privileges: the API roles get table access, RLS decides rows.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
`;

export async function createDb(files) {
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(SHIM);
  for (const file of files) {
    const sql = readFileSync(join(REPO, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      console.log('FAIL', file, '->', error.message);
      throw error;
    }
  }
  return db;
}

/** Runs fn inside a transaction as the given API role and user (like a PostgREST request). */
export async function as(db, role, userId, fn) {
  return db.transaction(async (tx) => {
    const claims = JSON.stringify(userId ? { sub: userId, role } : { role });
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [claims]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return fn(tx);
  });
}

export async function expectError(promise, pattern, label) {
  try {
    await promise;
    console.log(`  ✖ ${label}: expected an error matching ${pattern}`);
    process.exitCode = 1;
  } catch (error) {
    if (pattern.test(error.message)) console.log(`  ✔ ${label} (${error.message.slice(0, 70)})`);
    else { console.log(`  ✖ ${label}: unexpected error ${error.message}`); process.exitCode = 1; }
  }
}

export function check(condition, label, detail = '') {
  console.log(`  ${condition ? '✔' : '✖'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) process.exitCode = 1;
}
