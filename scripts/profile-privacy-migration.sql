-- ====================================================================
-- Empreende iCEV · profile privacy
-- Until now anyone holding the site's public key could read every
-- profile: e-mail, WhatsApp and push subscription of every student.
-- After this migration:
--   * companies (role 'seller') stay public: name, WhatsApp, avatar and
--     course, which students need to contact them;
--   * any other profile is visible only to its owner, to the other side
--     of a coupon they share, and to the institution's admins;
--   * e-mail and push_subscription can't be read through the API at all.
--     The app takes the user's own e-mail from the session, and the
--     server reads everything else with the service role.
--
-- RUN AFTER publishing the site version that no longer reads
-- profiles.email. Older versions ask for that column and would fail.
-- Idempotent: safe to run again.
-- ====================================================================

BEGIN;

-- Policy helpers. SECURITY DEFINER lets them read profiles and coupons
-- without going through RLS again: a policy on profiles that queried
-- profiles (or coupons, whose policies query profiles) would recurse.
CREATE OR REPLACE FUNCTION public.is_admin_for_institution(p_institution UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = auth.uid()
      AND (me.role = 'superadmin' OR (me.role = 'admin' AND me.institution_id = p_institution))
  );
$$;

-- True when the caller and p_profile are the two sides of a coupon:
-- the company sees who took its coupons, the student sees whose coupon it holds.
CREATE OR REPLACE FUNCTION public.shares_coupon_with(p_profile UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coupons c
    WHERE (c.buyer_id = p_profile AND c.seller_id = auth.uid())
       OR (c.seller_id = p_profile AND c.buyer_id = auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_for_institution(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shares_coupon_with(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_for_institution(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shares_coupon_with(UUID) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS coupons_seller_buyer_idx ON public.coupons (seller_id, buyer_id);

-- Who can see a profile row.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by audience" ON public.profiles;
CREATE POLICY "Profiles are viewable by audience" ON public.profiles
  FOR SELECT USING (
    id = (select auth.uid())
    OR role = 'seller'
    OR public.shares_coupon_with(id)
    OR public.is_admin_for_institution(institution_id)
    OR (select auth.role()) = 'service_role'
  );

-- Which columns the browser can read. Revoking the table privilege also
-- drops earlier column grants, so the list below is always the full set.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, name, whatsapp, avatar, role, course, semester, verified, institution_id, created_at)
  ON public.profiles TO anon, authenticated;

COMMIT;
