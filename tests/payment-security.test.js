import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPaymentReference, paymentMatchesIntent } from '../payment-security.js';

test('payment references reject PostgREST filter syntax', () => {
  assert.equal(isValidPaymentReference('linka_abc-123'), true);
  assert.equal(isValidPaymentReference('abc,external_reference.eq.other'), false);
  assert.equal(isValidPaymentReference(''), false);
  assert.equal(isValidPaymentReference('x'.repeat(201)), false);
});

test('provider payment must match order reference, currency, and amount', () => {
  const intent = { external_reference: 'linka_order_1', amount: '10.20' };
  const payment = { external_reference: 'linka_order_1', transaction_amount: 10.2, currency_id: 'BRL' };
  assert.equal(paymentMatchesIntent(payment, intent), true);
  assert.equal(paymentMatchesIntent({ ...payment, external_reference: 'another-order' }, intent), false);
  assert.equal(paymentMatchesIntent({ ...payment, transaction_amount: 1 }, intent), false);
  assert.equal(paymentMatchesIntent({ ...payment, currency_id: 'USD' }, intent), false);
  assert.equal(paymentMatchesIntent({ ...payment, transaction_amount: undefined }, intent), false);
});
