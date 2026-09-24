-- ====================================================================
-- Empreende iCEV · offer and account integrity
-- Found by the audit of the live site (2026-09-24):
--   1. Companies could change an approved offer straight through the
--      public API (price, discount, photos, coupon quantity, clicks)
--      and skip moderation. Offers now change only through the app's
--      server; new offers get their limits from the database.
--   2. A coupon that expired unused kept its slot forever, so one
--      student could empty an offer by claiming again after each
--      expiry. Stock now counts only coupons that still count (used,
--      or active and valid) in the offer's current batch.
--   3. Students could write any column of their own profile (e-mail,
--      institution, verified). Now only name, WhatsApp, avatar, course
--      and semester.
--   4. The student who holds a coupon keeps seeing the offer's name
--      after the company edits or removes it.
--   5. The company is notified when an offer is approved, refused or
--      sent back for adjustment.
--   6. Categories created by the first setup had no institution, so an
--      institution admin could not edit them.
--   7. A job every 10 minutes expires past coupons and offers and
--      recounts stock (pg_cron, when the project allows it).
--
-- Run AFTER publishing the site version from 2026-09-24 (offers are
-- edited through /api/seller/products). Idempotent: safe to run again.
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- Stock by batch. "Renovar" (and resubmitting a sold-out offer) starts a
-- new batch; only coupons of the current batch count against it.
-- --------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS batch_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Existing offers: their batch began when they were created.
UPDATE public.products SET batch_started_at = created_at
WHERE created_at IS NOT NULL AND batch_started_at > created_at;

CREATE OR REPLACE FUNCTION public.live_coupon_count(p_product UUID, p_since TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.coupons
  WHERE product_id = p_product
    AND created_at >= COALESCE(p_since, '-infinity'::timestamptz)
    AND (status = 'used' OR (status = 'active' AND (valid_until IS NULL OR valid_until > NOW())));
$$;

REVOKE ALL ON FUNCTION public.live_coupon_count(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_coupon_count(UUID, TIMESTAMPTZ) TO service_role;

-- --------------------------------------------------------------------
-- Offer guard, v3.
--   - database jobs and the server (service role): allowed;
--   - claim_coupon(): only the stock counter moves;
--   - admins: moderation;
--   - companies: may create an offer (limits set here), never update one
--     directly. Edits, renewals and deletions go through the server.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_product_rules()
RETURNS trigger AS $$
DECLARE
  is_trusted BOOLEAN := auth.role() IS NULL OR auth.role() = 'service_role';
  is_admin BOOLEAN := EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  );
  is_coupon_claim BOOLEAN := COALESCE(current_setting('empreende.coupon_claim', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT is_trusted THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('seller', 'admin', 'superadmin')
      ) THEN
        RAISE EXCEPTION 'SELLER_REQUIRED';
      END IF;
      IF NEW.discount IS NULL OR NEW.discount < 10 OR NEW.discount > 50 THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT';
      END IF;
      IF NEW.original_price IS NULL OR NEW.original_price <= 0 OR NEW.original_price > 999999 THEN
        RAISE EXCEPTION 'INVALID_PRICE';
      END IF;
      IF COALESCE(cardinality(NEW.images), 0) > 3 THEN
        RAISE EXCEPTION 'TOO_MANY_IMAGES';
      END IF;
      IF char_length(COALESCE(NEW.title, '')) NOT BETWEEN 3 AND 60
         OR char_length(COALESCE(NEW.description, '')) NOT BETWEEN 10 AND 200 THEN
        RAISE EXCEPTION 'INVALID_TEXT';
      END IF;
      NEW.seller_id := auth.uid();
      NEW.status := 'pending';
      NEW.institution_id := (SELECT institution_id FROM public.profiles WHERE id = auth.uid());
      NEW.slots_total := COALESCE((SELECT max_slots FROM public.categories WHERE id = NEW.category_id), 5);
      NEW.slots_used := 0;
      NEW.clicks := 0;
      NEW.expires_at := NULL;
      NEW.deleted_at := NULL;
      NEW.rejection_reason := NULL;
      NEW.created_at := NOW();
      NEW.batch_started_at := NOW();
      NEW.discount_price := round(NEW.original_price * (100 - NEW.discount) / 100.0, 2);
    END IF;
    NEW.slots_total := COALESCE(NEW.slots_total, 5);
    NEW.slots_used := COALESCE(NEW.slots_used, 0);
    NEW.clicks := COALESCE(NEW.clicks, 0);
    RETURN NEW;
  END IF;

  -- UPDATE
  IF is_coupon_claim THEN
    -- claim_coupon() only moves the counter: coupons of this batch that still count.
    NEW := OLD;
    NEW.slots_used := public.live_coupon_count(OLD.id, OLD.batch_started_at);
    RETURN NEW;
  END IF;

  IF is_trusted THEN
    -- A reset stock (renewal, sold-out offer sent again) starts a new batch.
    IF COALESCE(NEW.slots_used, 0) = 0 AND COALESCE(OLD.slots_used, 0) > 0 THEN
      NEW.batch_started_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  IF is_admin THEN
    -- Moderation. Stock, clicks and ownership stay as they are.
    NEW.seller_id := OLD.seller_id;
    NEW.slots_used := OLD.slots_used;
    NEW.clicks := OLD.clicks;
    NEW.batch_started_at := OLD.batch_started_at;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'PRODUCT_UPDATE_VIA_API: companies edit offers in the app.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- --------------------------------------------------------------------
-- The coupon keeps the offer's name, for the student's wallet.
-- --------------------------------------------------------------------
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS product_title TEXT;
UPDATE public.coupons c SET product_title = p.title
FROM public.products p
WHERE p.id = c.product_id AND c.product_title IS NULL;

-- --------------------------------------------------------------------
-- Retrieve a coupon, v2: stock counts the coupons of the current batch
-- that still count, so a code that expired unused frees its slot.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_coupon(p_product_id UUID)
RETURNS public.coupons
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_code TEXT;
  v_bytes BYTEA;
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O, 1/I
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_profile.institution_id IS NULL THEN
    RAISE EXCEPTION 'INSTITUTION_REQUIRED';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND OR v_product.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'OFFER_NOT_FOUND';
  END IF;
  IF v_product.status <> 'active'
     OR (v_product.expires_at IS NOT NULL AND v_product.expires_at <= NOW()) THEN
    RAISE EXCEPTION 'OFFER_UNAVAILABLE';
  END IF;
  IF v_product.institution_id IS DISTINCT FROM v_profile.institution_id THEN
    RAISE EXCEPTION 'OTHER_INSTITUTION';
  END IF;
  IF v_product.seller_id = v_uid THEN
    RAISE EXCEPTION 'OWN_OFFER';
  END IF;

  -- One live coupon per student per offer: asking again returns the same code.
  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE product_id = p_product_id
    AND buyer_id = v_uid
    AND status = 'active'
    AND (valid_until IS NULL OR valid_until > NOW())
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN v_coupon;
  END IF;

  IF public.live_coupon_count(v_product.id, v_product.batch_started_at) >= COALESCE(v_product.slots_total, 0) THEN
    RAISE EXCEPTION 'SOLD_OUT';
  END IF;

  FOR attempt IN 1..5 LOOP
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    FOR i IN 0..7 LOOP
      -- 256 is a multiple of 32, so the modulo keeps every letter equally likely.
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
      IF i = 3 THEN
        v_code := v_code || '-';
      END IF;
    END LOOP;

    BEGIN
      INSERT INTO public.coupons (code, product_id, buyer_id, seller_id, status, valid_until, product_title)
      VALUES (
        v_code,
        v_product.id,
        v_uid,
        v_product.seller_id,
        'active',
        LEAST(
          NOW() + make_interval(hours => COALESCE(v_product.coupon_valid_hours, 24)),
          COALESCE(v_product.expires_at, 'infinity'::timestamptz)
        ),
        v_product.title
      )
      RETURNING * INTO v_coupon;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF attempt = 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  -- The offer guard only lets slots_used move while this flag is set (transaction-local).
  PERFORM set_config('empreende.coupon_claim', 'on', true);
  UPDATE public.products SET slots_used = slots_used WHERE id = v_product.id;
  PERFORM set_config('empreende.coupon_claim', 'off', true);

  INSERT INTO public.notifications (user_id, institution_id, title, body, type, action_url)
  VALUES (
    v_product.seller_id,
    v_product.institution_id,
    'Cupom retirado',
    format('Um aluno retirou um cupom de "%s". Confira o código quando ele comprar.', v_product.title),
    'info',
    '#/seller/coupons'
  );

  RETURN v_coupon;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_coupon(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_coupon(UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------
-- Profiles: the browser edits only what the profile screen shows.
-- E-mail, institution, role, verification and push stay server-side.
-- (handle_new_user creates every profile at sign-up.)
-- --------------------------------------------------------------------
REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (name, whatsapp, avatar, course, semester) ON public.profiles TO authenticated;

-- --------------------------------------------------------------------
-- The company hears about moderation.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_offer_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    INSERT INTO public.notifications (user_id, institution_id, title, body, type, action_url)
    VALUES (NEW.seller_id, NEW.institution_id, 'Oferta aprovada',
            format('"%s" já está na vitrine.', NEW.title), 'success', '#/seller/ads');
  ELSIF NEW.status = 'rejected' THEN
    INSERT INTO public.notifications (user_id, institution_id, title, body, type, action_url)
    VALUES (NEW.seller_id, NEW.institution_id,
            CASE WHEN NEW.rejection_reason LIKE 'Ajuste solicitado:%' THEN 'Ajuste solicitado' ELSE 'Oferta recusada' END,
            COALESCE(NULLIF(NEW.rejection_reason, ''), format('"%s" não foi aprovada.', NEW.title)),
            'warning', '#/seller/ads');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_offer_moderation ON public.products;
CREATE TRIGGER notify_offer_moderation
AFTER UPDATE OF status ON public.products
FOR EACH ROW
WHEN ((OLD.status = 'pending' AND NEW.status = 'active') OR (NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected'))
EXECUTE FUNCTION public.notify_offer_moderation();

-- --------------------------------------------------------------------
-- Categories from the first setup belong to the institution, when there
-- is only one (institution admins can then edit them).
-- --------------------------------------------------------------------
UPDATE public.categories
SET institution_id = (SELECT id FROM public.institutions LIMIT 1)
WHERE institution_id IS NULL
  AND (SELECT COUNT(*) FROM public.institutions) = 1;

-- --------------------------------------------------------------------
-- Housekeeping: expire past coupons and offers, recount stock.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_offers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.coupons SET status = 'expired'
  WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until <= NOW();

  UPDATE public.products p
  SET slots_used = public.live_coupon_count(p.id, p.batch_started_at)
  WHERE p.deleted_at IS NULL
    AND p.status IN ('active', 'pending')
    AND p.slots_used IS DISTINCT FROM public.live_coupon_count(p.id, p.batch_started_at);

  UPDATE public.products SET status = 'expired'
  WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_offers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_offers() TO service_role;

SELECT public.refresh_offers();

COMMIT;

-- Every 10 minutes, when pg_cron can be enabled. Outside the transaction:
-- if the project does not allow it, everything above is already saved.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'empreende-refresh-offers';
  PERFORM cron.schedule('empreende-refresh-offers', '*/10 * * * *', 'SELECT public.refresh_offers()');
  RAISE NOTICE 'pg_cron: empreende-refresh-offers scheduled every 10 minutes.';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron is not available (%). Enable it in Database > Extensions and run this file again.', SQLERRM;
END;
$$;
