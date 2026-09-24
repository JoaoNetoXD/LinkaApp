import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPhoneBR } from '../src/utils/phone.js';

test('WhatsApp numbers read as (DD) 9XXXX-XXXX however they were typed', () => {
  assert.equal(formatPhoneBR('86999001122'), '(86) 99900-1122');
  assert.equal(formatPhoneBR('5586999001122'), '(86) 99900-1122', 'country code is dropped');
  assert.equal(formatPhoneBR('+55 (86) 99900-1122'), '(86) 99900-1122');
  assert.equal(formatPhoneBR('8632214455'), '(86) 3221-4455', 'landlines keep 4 + 4 digits');
});

test('anything that is not a phone number is left as typed', () => {
  assert.equal(formatPhoneBR('123'), '123');
  assert.equal(formatPhoneBR('  '), '');
  assert.equal(formatPhoneBR(null), '');
});
