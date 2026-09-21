import test from 'node:test';
import assert from 'node:assert/strict';
import { hasVisibleDiscount } from '../src/utils/pricing.js';

test('shows a discount only when the current price is lower', () => {
  assert.equal(hasVisibleDiscount({ discount: 15, originalPrice: 12, discountPrice: 10.2 }), true);
  assert.equal(hasVisibleDiscount({ discount: 0, originalPrice: 45, discountPrice: 45 }), false);
  assert.equal(hasVisibleDiscount({ discount: 20, originalPrice: 45, discountPrice: 45 }), false);
  assert.equal(hasVisibleDiscount({ discount: 20, originalPrice: 45, discountPrice: 50 }), false);
});
