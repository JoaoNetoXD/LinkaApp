import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAdminRole, canSuperadminEditProfile } from '../access-control.js';

test('admin checks distinguish platform owner from ordinary accounts', () => {
  assert.equal(isAdminRole('buyer'), false);
  assert.equal(isAdminRole('seller'), false);
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('superadmin'), true);
  assert.equal(canSuperadminEditProfile({ role: 'admin' }, { role: 'buyer' }, { role: 'admin' }), false);
  assert.equal(canSuperadminEditProfile({ role: 'superadmin' }, { role: 'superadmin' }, { role: 'buyer' }), false);
  assert.equal(canSuperadminEditProfile({ role: 'superadmin' }, { role: 'buyer' }, { role: 'superadmin' }), false);
  assert.equal(canSuperadminEditProfile({ role: 'superadmin' }, { role: 'buyer' }, { role: 'admin' }), true);
});

test('database migration blocks browser role changes and includes superadmin in read policies', () => {
  const sql = readFileSync(new URL('../scripts/superadmin-migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /CHECK \(role IN \('buyer', 'seller', 'admin', 'superadmin'\)\)/);
  assert.match(sql, /NEW\.role := OLD\.role;/);
  assert.match(sql, /FOR UPDATE TO authenticated\s+USING \(\(select auth\.uid\(\)\) = id\)/i);
  assert.match(sql, /p\.role = 'superadmin' OR \(p\.role = 'admin' AND p\.institution_id = products\.institution_id\)/);
  assert.doesNotMatch(sql, /GRANT\s+(?:UPDATE|ALL)\s+ON\s+public\.profiles\s+TO\s+anon/i);
});

test('backend routes verify live profile role before using service credentials', () => {
  const code = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(code, /function assertSuperadmin\(auth\)[\s\S]*?auth\.profile\?\.role !== 'superadmin'/);
  assert.match(code, /app\.patch\('\/api\/superadmin\/users\/:userId'[\s\S]*?assertSuperadmin\(auth\)/);
  assert.match(code, /app\.post\('\/api\/superadmin\/institutions'[\s\S]*?assertSuperadmin\(auth\)/);
});
