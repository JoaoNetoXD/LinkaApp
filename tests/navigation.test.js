import test from 'node:test';
import assert from 'node:assert/strict';
import { authRoute, isValidOfferId, offerRoute, readNextRoute } from '../src/utils/navigation.js';
import { offerShareText } from '../src/utils/share.js';

const OFFER_ID = '7f3c2a10-5b1e-4c9d-8a77-0e2f4b6c8d90';

test('the sign-in link returns to the offer that asked for it', () => {
  const signIn = authRoute({ next: offerRoute(OFFER_ID) });
  assert.equal(readNextRoute(signIn), `#/buyer/offer?id=${OFFER_ID}`);
  assert.equal(readNextRoute(authRoute({ intent: 'signup', next: offerRoute('2') })), '#/buyer/offer?id=2');
});

test('the sign-in only returns to offer pages inside the app', () => {
  const next = (value) => `#/auth?next=${encodeURIComponent(value)}`;
  assert.equal(readNextRoute(next('https://example.com/#/buyer/offer?id=2')), '', 'no other sites');
  assert.equal(readNextRoute(next('//example.com')), '');
  assert.equal(readNextRoute(next('#/admin')), '', 'no other screens');
  assert.equal(readNextRoute(next('#/buyer/offer?id=2&next=#/admin')), '', 'no extra parameters');
  assert.equal(readNextRoute(next('#/buyer/offer?id=<script>')), '');
  assert.equal(readNextRoute(next('#/buyer/offer?id=%E0%A4%A')), '', 'broken escapes are ignored');
  assert.equal(readNextRoute('#/auth'), '');
});

test('offer ids are the database UUIDs or short mock ids, nothing else', () => {
  assert.ok(isValidOfferId(OFFER_ID));
  assert.ok(isValidOfferId('2'));
  assert.ok(!isValidOfferId(''));
  assert.ok(!isValidOfferId('../admin'));
  assert.ok(!isValidOfferId('a'.repeat(65)));
});

test('the share message never needs a gendered article before the offer title', () => {
  const formatCurrency = (value) => `R$ ${value.toFixed(2).replace('.', ',')}`;
  assert.equal(
    offerShareText({ title: 'Camiseta Universitária', discount: 15, discountPrice: 59.42 }, formatCurrency),
    'Camiseta Universitária com 15% de desconto: sai por R$ 59,42 com o cupom do Empreende iCEV.',
  );
  assert.equal(
    offerShareText({ title: 'Aula de Cálculo', discount: 0, discountPrice: 64 }, formatCurrency),
    'Aula de Cálculo por R$ 64,00 no Empreende iCEV.',
  );
});
