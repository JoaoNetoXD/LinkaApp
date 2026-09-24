import test from 'node:test';
import assert from 'node:assert/strict';
import { toSearchTerm } from '../src/utils/search.js';

test('search text keeps words, accents and numbers', () => {
  assert.equal(toSearchTerm('  Açaí 500ml  '), 'Açaí 500ml');
  assert.equal(toSearchTerm('pão de queijo'), 'pão de queijo');
  assert.equal(toSearchTerm("d'água"), "d'água");
});

test('characters that would rewrite the database filter are dropped', () => {
  assert.equal(toSearchTerm('bolo, brownie'), 'bolo brownie');
  assert.equal(toSearchTerm('camiseta (P)'), 'camiseta P');
  assert.equal(toSearchTerm('title.eq.x),or(id.gt.0'), 'title.eq.x or id.gt.0');
  assert.equal(toSearchTerm('100% algodão*'), '100 algodão');
  assert.equal(toSearchTerm('"aula"'), 'aula');
  assert.equal(toSearchTerm(null), '');
});

test('long searches are cut to a sane length', () => {
  assert.equal(toSearchTerm('a'.repeat(200)).length, 60);
});
