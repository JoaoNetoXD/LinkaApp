import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../scripts/coupon-claim-migration.sql', import.meta.url), 'utf8');

// Header plus body of one function: from CREATE up to the closing $$ of its body.
function functionBody(name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `${name} is defined`);
  const bodyStart = sql.indexOf('$$', start) + 2;
  return sql.slice(start, sql.indexOf('$$', bodyStart));
}

test('only signed-in students of the offer institution can retrieve a coupon', () => {
  const claim = functionBody('claim_coupon');
  assert.match(claim, /SECURITY DEFINER/);
  assert.match(claim, /v_uid UUID := auth\.uid\(\)/);
  assert.match(claim, /RAISE EXCEPTION 'AUTH_REQUIRED'/);
  assert.match(claim, /RAISE EXCEPTION 'INSTITUTION_REQUIRED'/);
  assert.match(claim, /IS DISTINCT FROM v_profile\.institution_id[\s\S]*RAISE EXCEPTION 'OTHER_INSTITUTION'/);
  assert.match(claim, /v_product\.seller_id = v_uid[\s\S]*RAISE EXCEPTION 'OWN_OFFER'/);
});

test('coupon retrieval is atomic, capped and idempotent per student', () => {
  const claim = functionBody('claim_coupon');
  assert.match(claim, /FROM public\.products WHERE id = p_product_id FOR UPDATE/);
  assert.match(claim, /slots_used, 0\) >= COALESCE\(v_product\.slots_total, 0\)[\s\S]*RAISE EXCEPTION 'SOLD_OUT'/);
  assert.match(claim, /buyer_id = v_uid[\s\S]*status = 'active'[\s\S]*IF FOUND THEN\s+RETURN v_coupon;/);
  assert.match(claim, /extensions\.gen_random_bytes\(8\)/);
  assert.doesNotMatch(claim, /uuid_generate_v4|random\(\)/, 'codes use cryptographic randomness');
});

test('the coupon counter can only move inside claim_coupon', () => {
  const guard = functionBody('enforce_product_rules');
  assert.match(guard, /current_setting\('empreende\.coupon_claim', true\)/);
  assert.match(guard, /IF TG_OP = 'UPDATE' AND is_coupon_claim THEN\s+[\s\S]*?NEW := OLD;/);
  assert.match(guard, /NEW\.institution_id := \(SELECT institution_id FROM public\.profiles WHERE id = auth\.uid\(\)\)/);
  const claim = functionBody('claim_coupon');
  // is_local = true keeps the flag inside the claim transaction.
  assert.match(claim, /set_config\('empreende\.coupon_claim', 'on', true\)/);
  assert.match(claim, /set_config\('empreende\.coupon_claim', 'off', true\)/);
});

test('retrieval is exposed to signed-in users only', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.claim_coupon\(UUID\) FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_coupon\(UUID\) TO authenticated, service_role;/);
  assert.doesNotMatch(sql, /GRANT\s+[^;]*INSERT[^;]*ON\s+(public\.)?coupons\s+TO\s+authenticated/i);
});

test('sign-up requires an institutional e-mail domain', () => {
  const signup = functionBody('handle_new_user');
  assert.match(signup, /lower\(domain\) = user_domain/);
  assert.match(signup, /settings -> 'extra_domains'/);
  assert.match(signup, /IF inst_id IS NULL THEN\s+RAISE EXCEPTION 'INSTITUTIONAL_EMAIL_REQUIRED/);
});
