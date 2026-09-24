-- ====================================================================
-- Empreende iCEV · coupon-only model
-- The platform only advertises discount coupons. Students retrieve a
-- personal code and buy directly from the student-owned company; there
-- is no payment inside the platform. Idempotent: safe to run again.
--
-- BEFORE RUNNING: confirm the student e-mail domain in public.institutions
-- (column "domain", e.g. '@icev.edu.br'). Sign-ups from any other domain
-- are rejected once this runs. Extra domains go in settings.extra_domains.
-- ====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Coupon validity chosen by the company per offer (already applied in some projects).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS coupon_valid_hours integer NOT NULL DEFAULT 24;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_coupon_valid_hours_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_coupon_valid_hours_check CHECK (coupon_valid_hours BETWEEN 1 AND 720);
  END IF;
END $$;

-- Fast lookup of a student's live coupon for an offer.
CREATE INDEX IF NOT EXISTS coupons_buyer_product_status_idx
  ON public.coupons (buyer_id, product_id, status);

-- --------------------------------------------------------------------
-- 1. Sign-up only with an institutional e-mail.
--    Allowed domains: institutions.domain plus institutions.settings.extra_domains
--    (a JSON array such as ["@aluno.icev.edu.br"]), both editable by admins.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_domain TEXT;
  inst_id UUID;
  user_name TEXT;
  user_role TEXT;
BEGIN
  user_domain := '@' || lower(split_part(new.email, '@', 2));

  SELECT id INTO inst_id
  FROM public.institutions
  WHERE lower(domain) = user_domain
     OR COALESCE(settings -> 'extra_domains', '[]'::jsonb) ? user_domain
  LIMIT 1;

  IF inst_id IS NULL THEN
    RAISE EXCEPTION 'INSTITUTIONAL_EMAIL_REQUIRED: use o e-mail institucional do iCEV para criar a conta.';
  END IF;

  user_name := COALESCE(NULLIF(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1), 'Usuário');
  user_role := lower(COALESCE(NULLIF(new.raw_user_meta_data->>'role', ''), 'buyer'));
  IF user_role NOT IN ('buyer', 'seller') THEN
    user_role := 'buyer';
  END IF;

  INSERT INTO public.profiles (id, name, email, role, institution_id, whatsapp)
  VALUES (new.id, user_name, new.email, user_role, inst_id, NULLIF(new.raw_user_meta_data->>'whatsapp', ''));
  RETURN new;
END;
$$;

-- --------------------------------------------------------------------
-- 2. Offer guard. Same rules as before, plus:
--    - the offer always belongs to the seller's own institution;
--    - slots_used may change inside claim_coupon(), which sets a
--      transaction-local flag. Browser updates can never set it.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_product_rules()
RETURNS trigger AS $$
DECLARE
  caller_role TEXT := COALESCE(auth.role(), '');
  is_admin BOOLEAN := EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  );
  is_coupon_claim BOOLEAN := COALESCE(current_setting('empreende.coupon_claim', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF caller_role <> 'service_role' THEN
      NEW.seller_id := auth.uid();
      NEW.status := 'pending';
      NEW.institution_id := (SELECT institution_id FROM public.profiles WHERE id = auth.uid());
    END IF;
    NEW.slots_total := COALESCE(NEW.slots_total, 5);
    NEW.slots_used := COALESCE(NEW.slots_used, 0);
    NEW.clicks := COALESCE(NEW.clicks, 0);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND is_coupon_claim THEN
    -- claim_coupon() only moves the counter; everything else stays as it was.
    NEW := OLD;
    NEW.slots_used := COALESCE(OLD.slots_used, 0) + 1;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT is_admin AND caller_role <> 'service_role' THEN
    NEW.seller_id := OLD.seller_id;
    NEW.slots_total := OLD.slots_total;
    NEW.clicks := OLD.clicks;
    NEW.institution_id := OLD.institution_id;
    NEW.rejection_reason := OLD.rejection_reason;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (NEW.status = 'pending' AND OLD.status IN ('expired', 'rejected')) THEN
        NEW.status := OLD.status;
      END IF;
    END IF;
    IF NOT (NEW.status = 'pending' AND OLD.status IN ('expired', 'rejected')) THEN
      NEW.slots_used := OLD.slots_used;
      NEW.expires_at := OLD.expires_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- --------------------------------------------------------------------
-- 3. Retrieve a coupon. The only way a student obtains a code.
--    Atomic: the offer row is locked, so two students cannot take the
--    last coupon at the same time.
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

  IF COALESCE(v_product.slots_used, 0) >= COALESCE(v_product.slots_total, 0) THEN
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
      INSERT INTO public.coupons (code, product_id, buyer_id, seller_id, status, valid_until)
      VALUES (
        v_code,
        v_product.id,
        v_uid,
        v_product.seller_id,
        'active',
        LEAST(
          NOW() + make_interval(hours => COALESCE(v_product.coupon_valid_hours, 24)),
          COALESCE(v_product.expires_at, 'infinity'::timestamptz)
        )
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

COMMIT;
