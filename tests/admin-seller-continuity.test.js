import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, as } from './sql/harness.mjs';

const INST = '00000000-0000-0000-0000-000000000001';
const SELLER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const OTHER_ADMIN = '33333333-3333-4333-8333-333333333333';
const BUYER = '44444444-4444-4444-8444-444444444444';

const migration = readFileSync(new URL('../scripts/admin-seller-continuity-migration.sql', import.meta.url), 'utf8');

async function visibleProfileIds(db, role, userId) {
  const result = await as(db, role, userId, (tx) => tx.query('SELECT id FROM public.profiles ORDER BY id'));
  return result.rows.map((row) => row.id);
}

async function canWriteImage(db, userId, path) {
  return as(db, 'authenticated', userId, (tx) => tx.query(
    'INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2)',
    ['product-images', path],
  ));
}

test('promotion preserves own image writes and makes admin contact public only while an offer is active', async () => {
  const db = await createDb([
    'supabase_schema.sql',
    'scripts/superadmin-migration.sql',
    'scripts/profile-privacy-migration.sql',
  ]);
  try {
    // Minimal Supabase Storage shim; its policies run with the real auth.uid()
    // and RLS behavior from the project schema.
    await db.exec(`
      CREATE SCHEMA storage;
      CREATE TABLE storage.objects (bucket_id text NOT NULL, name text PRIMARY KEY);
      CREATE FUNCTION storage.foldername(path text) RETURNS text[]
        LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(path, '/') $$;
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO authenticated;
      GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
      CREATE POLICY "Sellers view own product image objects" ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
    `);

    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
        ('${SELLER}', 'seller@somosicev.com', '{"role":"seller"}'),
        ('${ADMIN}', 'admin@somosicev.com', '{"role":"seller"}'),
        ('${OTHER_ADMIN}', 'other@somosicev.com', '{}'),
        ('${BUYER}', 'buyer@somosicev.com', '{}');
      UPDATE public.profiles SET role = 'admin' WHERE id IN ('${ADMIN}', '${OTHER_ADMIN}');
    `);
    assert.equal((await db.query('SELECT institution_id FROM public.profiles WHERE id = $1', [ADMIN])).rows[0].institution_id, INST);

    // Recreate the production policy before this migration. The canonical
    // profile setup above already contains the fix for future installations.
    await db.exec(`
      DROP POLICY "Profiles are viewable by audience" ON public.profiles;
      CREATE POLICY "Profiles are viewable by audience" ON public.profiles
        FOR SELECT USING (
          id = (select auth.uid()) OR role = 'seller'
          OR public.shares_coupon_with(id)
          OR public.is_admin_for_institution(institution_id)
          OR (select auth.role()) = 'service_role'
        );
    `);
    const offer = await as(db, 'service_role', null, (tx) => tx.query(`
      INSERT INTO public.products
        (seller_id, title, category_id, original_price, discount, discount_price, institution_id, status, expires_at)
      VALUES ($1, 'Offer', 'food', 10, 20, 8, $2, 'active', now() + interval '1 day')
      RETURNING id`, [ADMIN, INST]));
    const offerId = offer.rows[0].id;
    assert.deepEqual(await visibleProfileIds(db, 'anon', null), [SELLER],
      'before migration, a promoted seller disappears from the public profile embed');

    await db.exec(migration);
    await db.exec(migration); // idempotent in the same shape used by SQL Editor.

    assert.deepEqual(await visibleProfileIds(db, 'anon', null), [SELLER, ADMIN],
      'migration restores public contact for the active offer');
    await as(db, 'service_role', null, (tx) => tx.query(
      "UPDATE public.products SET status = 'pending' WHERE id = $1", [offerId]));

    const beforeOffer = await visibleProfileIds(db, 'anon', null);
    assert.deepEqual(beforeOffer, [SELLER], 'an unrelated admin and an admin without an offer stay private');

    await canWriteImage(db, ADMIN, `${ADMIN}/own.jpg`);
    await canWriteImage(db, SELLER, `${SELLER}/own.jpg`);
    await assert.rejects(canWriteImage(db, ADMIN, `${SELLER}/foreign.jpg`), /row-level security/i);
    await assert.rejects(canWriteImage(db, BUYER, `${BUYER}/buyer.jpg`), /row-level security/i);
    const deleted = await as(db, 'authenticated', ADMIN, (tx) => tx.query(
      'DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2 RETURNING name',
      ['product-images', `${ADMIN}/own.jpg`],
    ));
    assert.equal(deleted.rows[0]?.name, `${ADMIN}/own.jpg`, 'promoted admin can remove own photo');

    assert.deepEqual(await visibleProfileIds(db, 'anon', null), [SELLER], 'pending offer does not reveal an admin');

    await as(db, 'service_role', null, (tx) => tx.query(
      "UPDATE public.products SET status = 'active' WHERE id = $1", [offerId]));
    assert.deepEqual(await visibleProfileIds(db, 'anon', null), [SELLER, ADMIN], 'active offer reveals only its admin seller');
    assert.deepEqual(await visibleProfileIds(db, 'authenticated', BUYER), [SELLER, ADMIN, BUYER],
      'buyer sees seller contact but not an unrelated admin');

    await as(db, 'service_role', null, (tx) => tx.query(
      "UPDATE public.products SET expires_at = now() - interval '1 minute' WHERE id = $1", [offerId]));
    assert.deepEqual(await visibleProfileIds(db, 'anon', null), [SELLER], 'expired offer removes public admin visibility');

    await as(db, 'service_role', null, (tx) => tx.query(
      "UPDATE public.products SET expires_at = now() + interval '1 day', deleted_at = now() WHERE id = $1", [offerId]));
    assert.deepEqual(await visibleProfileIds(db, 'anon', null), [SELLER], 'deleted offer does not reveal admin');
  } finally {
    await db.close();
  }
});
