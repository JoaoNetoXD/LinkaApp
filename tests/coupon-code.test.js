import test from 'node:test';
import assert from 'node:assert/strict';
import { getCouponCodeCandidates } from '../src/utils/coupon-code.js';

test('seller can type a coupon code with or without the hyphen', () => {
  assert.deepEqual(getCouponCodeCandidates('abcd2345'), ['ABCD2345', 'ABCD-2345']);
  assert.deepEqual(getCouponCodeCandidates(' ABCD-2345 '), ['ABCD2345', 'ABCD-2345']);
  assert.deepEqual(getCouponCodeCandidates('lk3f9a1c2b'), ['LK3F9A1C2B'], 'legacy codes keep their shape');
  assert.deepEqual(getCouponCodeCandidates('  '), []);
});
