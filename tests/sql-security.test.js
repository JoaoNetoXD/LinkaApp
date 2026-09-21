import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'supabase_schema.sql',
  'scripts/payment-security-migration.sql',
  'scripts/fix-permissions-supabase.sql',
];

test('SQL setup scripts never restore direct payment writes', () => {
  for (const file of files) {
    const sql = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /CREATE POLICY\s+"(?:Buyers insert own payments|Participants update own payments)"/i, file);
    assert.doesNotMatch(sql, /GRANT\s+[^;]*(?:INSERT|UPDATE)\s+ON\s+public\.payments\s+TO\s+authenticated/i, file);
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.payments FROM anon, authenticated/i, file);
  }
});
