-- Empreende iCEV: add a platform owner role without changing existing users.
BEGIN;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('buyer', 'seller', 'admin', 'superadmin'));

CREATE OR REPLACE FUNCTION public.enforce_profile_role_rules()
RETURNS trigger AS $$
DECLARE
  caller_uid UUID := auth.uid();
  request_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(auth.role(), ''), current_role, ''
  );
  is_privileged_context BOOLEAN := caller_uid IS NULL AND request_role NOT IN ('anon', 'authenticated');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role NOT IN ('buyer', 'seller', 'admin', 'superadmin') THEN
      NEW.role := 'buyer';
    END IF;
    IF NEW.role IN ('admin', 'superadmin')
       AND request_role <> 'service_role' AND NOT is_privileged_context THEN
      NEW.role := 'buyer';
    END IF;
    IF NEW.name IS NULL OR NEW.name = '' THEN
      NEW.name := COALESCE(NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'Usuario');
    END IF;
    RETURN NEW;
  END IF;

  -- Role changes are never accepted directly from a browser session.
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role
     AND request_role <> 'service_role' AND NOT is_privileged_context THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
CREATE POLICY "Users can manage own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Products are viewable by audience" ON public.products;
CREATE POLICY "Products are viewable by audience" ON public.products
  FOR SELECT USING (
    status = 'active' OR seller_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid())
      AND (p.role = 'superadmin' OR (p.role = 'admin' AND p.institution_id = products.institution_id)))
    OR (select auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "Products are writable by owner or admin" ON public.products;
CREATE POLICY "Products are writable by owner or admin" ON public.products
  FOR UPDATE USING (
    seller_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid())
      AND (p.role = 'superadmin' OR (p.role = 'admin' AND p.institution_id = products.institution_id)))
    OR (select auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "Payments are viewable by participants" ON public.payments;
CREATE POLICY "Payments are viewable by participants" ON public.payments
  FOR SELECT USING (
    buyer_id = (select auth.uid()) OR seller_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid())
      AND (p.role = 'superadmin' OR (p.role = 'admin' AND EXISTS (
        SELECT 1 FROM public.products pr WHERE pr.id = payments.product_id AND pr.institution_id = p.institution_id))))
    OR (select auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "Coupons are viewable by participants" ON public.coupons;
CREATE POLICY "Coupons are viewable by participants" ON public.coupons
  FOR SELECT USING (
    buyer_id = (select auth.uid()) OR seller_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid())
      AND (p.role = 'superadmin' OR (p.role = 'admin' AND EXISTS (
        SELECT 1 FROM public.products pr WHERE pr.id = coupons.product_id AND pr.institution_id = p.institution_id))))
    OR (select auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "Coupons are writable by seller or admin" ON public.coupons;
CREATE POLICY "Coupons are writable by seller or admin" ON public.coupons
  FOR UPDATE USING (
    seller_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (select auth.uid())
      AND (p.role = 'superadmin' OR (p.role = 'admin' AND EXISTS (
        SELECT 1 FROM public.products pr WHERE pr.id = coupons.product_id AND pr.institution_id = p.institution_id))))
    OR (select auth.role()) = 'service_role'
  );

CREATE OR REPLACE FUNCTION public.enforce_product_rules()
RETURNS trigger AS $$
DECLARE
  caller_role TEXT := COALESCE(auth.role(), '');
  is_admin BOOLEAN := EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  );
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF caller_role <> 'service_role' THEN
      NEW.seller_id := auth.uid();
      NEW.status := 'pending';
    END IF;
    NEW.slots_total := COALESCE(NEW.slots_total, 5);
    NEW.slots_used := COALESCE(NEW.slots_used, 0);
    NEW.clicks := COALESCE(NEW.clicks, 0);
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

COMMIT;
