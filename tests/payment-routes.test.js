import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPaymentRoute } from '../payment-routes.js';

test('payment routes are recognised so they can be switched off', () => {
  for (const path of ['/api/pix', '/api/preference', '/api/webhook', '/api/payment/123',
    '/api/mercadopago/status', '/api/mercadopago/oauth/start', '/api/products/abc/payment-ready', '/api/seller/abc/payments']) {
    assert.equal(isPaymentRoute(path), true, path);
  }
});

test('coupon, catalogue and admin routes keep working without payments', () => {
  for (const path of ['/api/health', '/api/products/abc/click', '/api/profile/become-seller', '/api/admin/stats',
    '/api/seller/products/abc', '/api/superadmin/users', '/api/payments-report']) {
    assert.equal(isPaymentRoute(path), false, path);
  }
});

test('server answers payment routes with 410 unless PAYMENTS_ENABLED is true', () => {
  const code = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(code, /const PAYMENTS_ENABLED = String\(process\.env\.PAYMENTS_ENABLED \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'true';/);
  assert.match(code, /if \(PAYMENTS_ENABLED \|\| !isPaymentRoute\(req\.path\)\) return next\(\);\s+res\.status\(410\)/);
});

test('approving an offer does not require Mercado Pago while payments are off', () => {
  const code = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const readiness = code.slice(code.indexOf('async function getProductPaymentReadiness'));
  const gate = readiness.indexOf('if (!PAYMENTS_ENABLED) {');
  const accountCheck = readiness.indexOf('getSellerPaymentAccount(');
  assert.ok(gate > -1 && gate < accountCheck, 'the payments gate runs before the seller account lookup');
});
