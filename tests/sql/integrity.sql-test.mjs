// Exercises scripts/integrity-migration.sql on the full schema. Run: npm run test:sql
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDb, as, expectError, check, REPO } from './harness.mjs';

const BASE = [
  'supabase_schema.sql',
  'scripts/superadmin-migration.sql',
  'scripts/security-hardening-migration.sql',
  'scripts/fix-permissions-supabase.sql',
  'scripts/product-soft-delete-migration.sql',
  'scripts/product-coupon-validity-migration.sql',
  'scripts/payment-security-migration.sql',
  'scripts/coupon-claim-migration.sql',
  'scripts/profile-privacy-migration.sql',
];

const SELLER = '11111111-1111-4111-8111-111111111111';
const BUYER = '22222222-2222-4222-8222-222222222222';
const BUYER2 = '33333333-3333-4333-8333-333333333333';
const ADMIN = '44444444-4444-4444-8444-444444444444';
const INST = '00000000-0000-0000-0000-000000000001';

async function seed(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${SELLER}', 'empresa@somosicev.com', '{"full_name":"Empresa","role":"seller"}'),
      ('${BUYER}', 'aluno@somosicev.com', '{"full_name":"Aluno"}'),
      ('${BUYER2}', 'aluna@somosicev.com', '{"full_name":"Aluna"}'),
      ('${ADMIN}', 'admin@somosicev.com', '{"full_name":"Admin"}');
    UPDATE public.profiles SET role = 'admin' WHERE id = '${ADMIN}';
  `);
}

async function createOffer(db, extra = {}) {
  const values = { title: 'Brownie artesanal', description: 'Brownie com nozes, embalado.', category_id: 'food', original_price: 12, discount: 25, discount_price: 9, ...extra };
  const res = await as(db, 'authenticated', SELLER, (tx) => tx.query(
    `INSERT INTO public.products (title, description, category_id, original_price, discount, discount_price, slots_total, slots_used, clicks, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active') RETURNING *`,
    [values.title, values.description, values.category_id, values.original_price, values.discount, values.discount_price, extra.slots_total ?? 5, extra.slots_used ?? 0, extra.clicks ?? 0],
  ));
  return res.rows[0];
}

async function approve(db, id) {
  await as(db, 'service_role', null, (tx) => tx.query(
    `UPDATE public.products SET status = 'active', expires_at = NOW() + interval '12 hours' WHERE id = $1`, [id]));
}

const claim = (db, user, id) => as(db, 'authenticated', user, (tx) => tx.query('SELECT * FROM public.claim_coupon($1)', [id]));

console.log('\n## Before the migration (production today)');
{
  const db = await createDb(BASE);
  await seed(db);
  const offer = await createOffer(db, { slots_used: -495, clicks: 9999 });
  check(offer.slots_used === -495 && offer.clicks === 9999, 'a company can set its own stock and clicks on insert', `slots_used=${offer.slots_used}`);
  await approve(db, offer.id);
  await as(db, 'authenticated', SELLER, (tx) => tx.query(`UPDATE public.products SET discount = 50, title = 'Mudado sem aprovação' WHERE id = $1`, [offer.id]));
  const after = (await db.query('SELECT status, title FROM public.products WHERE id = $1', [offer.id])).rows[0];
  check(after.status === 'active' && after.title === 'Mudado sem aprovação', 'a company can change a live offer without moderation', after.title);
}

console.log('\n## After scripts/integrity-migration.sql');
const db = await createDb([...BASE, 'scripts/integrity-migration.sql']);
await seed(db);

// Offers
const offer = await createOffer(db, { slots_used: -495, clicks: 9999, slots_total: 5000, discount_price: 0.01 });
check(offer.status === 'pending' && offer.slots_used === 0 && offer.clicks === 0 && offer.slots_total === 5, 'insert: stock, clicks, status and quantity come from the database', `total=${offer.slots_total}`);
check(Number(offer.discount_price) === 9, 'insert: the discounted price is recomputed', offer.discount_price);
await expectError(createOffer(db, { discount: 90 }), /INVALID_DISCOUNT/, 'insert: discount outside 10-50% is refused');
await expectError(as(db, 'authenticated', BUYER, (tx) => tx.query(
  `INSERT INTO public.products (title, description, category_id, original_price, discount, discount_price) VALUES ('Oferta', 'Descrição válida aqui', 'food', 10, 20, 8)`)), /SELLER_REQUIRED/, 'insert: a student without a company cannot create offers');

await approve(db, offer.id);
await expectError(as(db, 'authenticated', SELLER, (tx) => tx.query(`UPDATE public.products SET title = 'Mudado' WHERE id = $1`, [offer.id])), /PRODUCT_UPDATE_VIA_API/, 'update: a company cannot change a live offer directly');
await as(db, 'authenticated', ADMIN, (tx) => tx.query(`UPDATE public.products SET status = 'rejected', rejection_reason = 'Ajuste solicitado: foto' WHERE id = $1`, [offer.id]));
check((await db.query('SELECT status FROM public.products WHERE id = $1', [offer.id])).rows[0].status === 'rejected', 'update: an admin can still moderate');
await as(db, 'service_role', null, (tx) => tx.query(`UPDATE public.products SET status = 'pending' WHERE id = $1`, [offer.id]));
await approve(db, offer.id);

// Moderation notifications
const notes = (await db.query(`SELECT title FROM public.notifications WHERE user_id = $1 ORDER BY created_at`, [SELLER])).rows.map((r) => r.title);
check(notes.includes('Oferta aprovada') && notes.includes('Ajuste solicitado'), 'the company is notified of approval and adjustment requests', notes.join(', '));

// Coupons and stock
const c1 = (await claim(db, BUYER, offer.id)).rows[0];
check(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c1.code), 'claim: a student gets a code', c1.code);
check(c1.product_title === 'Brownie artesanal', 'claim: the coupon keeps the offer name', c1.product_title);
const again = (await claim(db, BUYER, offer.id)).rows[0];
check(again.code === c1.code, 'claim: asking again returns the same code');
check((await db.query('SELECT slots_used FROM public.products WHERE id = $1', [offer.id])).rows[0].slots_used === 1, 'claim: stock counts one coupon');

// The code expires unused: its slot comes back.
await db.query(`UPDATE public.coupons SET valid_until = NOW() - interval '1 minute' WHERE id = $1`, [c1.id]);
await db.query('SELECT public.refresh_offers()');
const stock = (await db.query('SELECT slots_used FROM public.products WHERE id = $1', [offer.id])).rows[0].slots_used;
const expired = (await db.query('SELECT status FROM public.coupons WHERE id = $1', [c1.id])).rows[0].status;
check(stock === 0 && expired === 'expired', 'an unused code that expired frees its slot', `slots_used=${stock}, coupon ${expired}`);

// Sell out, renew, new batch.
await db.query(`UPDATE public.products SET slots_total = 1 WHERE id = $1`, [offer.id]);
await claim(db, BUYER, offer.id);
await expectError(claim(db, BUYER2, offer.id), /SOLD_OUT/, 'claim: sold out once the batch is taken');
await as(db, 'service_role', null, (tx) => tx.query(`UPDATE public.products SET slots_used = 0, status = 'pending' WHERE id = $1`, [offer.id]));
await approve(db, offer.id);
const c3 = (await claim(db, BUYER2, offer.id)).rows[0];
check(Boolean(c3?.code), 'renewal starts a new batch: the next student gets a code');
await expectError(claim(db, SELLER, offer.id), /OWN_OFFER/, 'claim: a company cannot take its own coupon');

// Wallet after the company removes the offer.
await as(db, 'service_role', null, (tx) => tx.query(`UPDATE public.products SET status = 'expired', deleted_at = NOW() WHERE id = $1`, [offer.id]));
const wallet = (await as(db, 'authenticated', BUYER2, (tx) => tx.query(
  `SELECT c.code, c.product_title, p.title AS joined FROM public.coupons c LEFT JOIN public.products p ON p.id = c.product_id WHERE c.buyer_id = $1`, [BUYER2]))).rows[0];
check(wallet.product_title === 'Brownie artesanal', 'wallet keeps the offer name after the offer is removed', `joined=${wallet.joined}`);

// Profiles
await as(db, 'authenticated', BUYER, (tx) => tx.query(`UPDATE public.profiles SET name = 'Aluno Novo', whatsapp = '86999001122' WHERE id = $1`, [BUYER]));
check((await db.query('SELECT name FROM public.profiles WHERE id = $1', [BUYER])).rows[0].name === 'Aluno Novo', 'profile: a student can edit name and WhatsApp');
await expectError(as(db, 'authenticated', BUYER, (tx) => tx.query(`UPDATE public.profiles SET email = 'outra@somosicev.com' WHERE id = $1`, [BUYER])), /permission denied/, 'profile: e-mail cannot be changed from the browser');
await expectError(as(db, 'authenticated', ADMIN, (tx) => tx.query(`UPDATE public.profiles SET institution_id = NULL WHERE id = $1`, [ADMIN])), /permission denied/, 'profile: institution cannot be changed from the browser');

// Categories and idempotency
check((await db.query(`SELECT COUNT(*)::int AS n FROM public.categories WHERE institution_id IS NULL`)).rows[0].n === 0, 'categories now belong to the institution');
await db.exec(readFileSync(join(REPO, 'scripts/integrity-migration.sql'), 'utf8'));
check(true, 'running the migration a second time works');
