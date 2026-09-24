import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sql = read('scripts/profile-privacy-migration.sql');
const PRIVATE_COLUMNS = ['email', 'push_subscription'];

const columnList = (text) => text.split(',').map((column) => column.trim()).filter(Boolean);

function grantedColumns() {
  const match = /GRANT SELECT \(([^)]*)\)\s+ON public\.profiles TO anon, authenticated/.exec(sql);
  assert.ok(match, 'profiles has a column grant for anon and authenticated');
  return columnList(match[1]);
}

// Browser code plus the server, which reads profiles with the user's own token.
function codeFiles() {
  const pages = ['src/services', 'src/pages'].flatMap((dir) =>
    readdirSync(new URL(`../${dir}`, import.meta.url))
      .filter((file) => file.endsWith('.js'))
      .map((file) => `${dir}/${file}`));
  return [...pages, 'src/main.js', 'server.js'];
}

test('browser roles can never read e-mail or the push subscription', () => {
  assert.match(sql, /REVOKE SELECT ON public\.profiles FROM anon, authenticated;[\s\S]*GRANT SELECT \(/,
    'the table privilege is revoked before the column grant');
  for (const column of PRIVATE_COLUMNS) {
    assert.ok(!grantedColumns().includes(column), `${column} is not granted`);
  }
});

test('the profiles policy only calls definer helpers, so it cannot recurse', () => {
  const policy = /CREATE POLICY "Profiles are viewable by audience" ON public\.profiles([\s\S]*?);/.exec(sql)?.[1];
  assert.ok(policy, 'policy is defined');
  assert.doesNotMatch(policy, /\bFROM\b/i, 'no direct subquery inside the policy');
  for (const helper of ['is_admin_for_institution', 'shares_coupon_with']) {
    const fn = new RegExp(`FUNCTION public\\.${helper}\\([\\s\\S]*?\\$\\$;`).exec(sql)?.[0];
    assert.ok(fn, `${helper} is defined`);
    assert.match(fn, /SECURITY DEFINER/);
    assert.match(fn, /SET search_path = public/);
  }
});

test('app and server read only granted profile columns', () => {
  const granted = grantedColumns();
  const own = /const PROFILE_COLUMNS = '([^']+)'/.exec(read('src/services/auth-service.js'))?.[1];
  const server = /async function getProfile[\s\S]*?\.select\('([^']+)'\)/.exec(read('server.js'))?.[1];
  assert.ok(own && server, 'profile column lists found');

  const embedded = codeFiles().flatMap((file) =>
    [...read(file).matchAll(/profiles!\w+\s*\(([^)]*)\)/g)].map((match) => ({ file, columns: columnList(match[1]) })));
  assert.ok(embedded.length > 0, 'profile embeds found');

  for (const column of [...columnList(own), ...columnList(server)]) {
    assert.ok(granted.includes(column), `${column} is granted`);
  }
  for (const { file, columns } of embedded) {
    for (const column of columns) assert.ok(granted.includes(column), `${file} embeds ${column}, which is not granted`);
  }
});

test('browser code never selects every profile column', () => {
  for (const file of codeFiles().filter((path) => path.startsWith('src/'))) {
    assert.doesNotMatch(read(file), /from\('profiles'\)[\s\S]{0,80}\.select\('\*'\)/, `${file} selects * from profiles`);
  }
});
