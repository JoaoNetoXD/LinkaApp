-- Preserve a company's seller features when its owner becomes an institution
-- admin or superadmin. Run in Supabase SQL Editor after profile privacy and
-- product image storage policies. Safe to run again.
BEGIN;

-- A public offer needs its company's contact fields in the profiles embed.
-- Admin profiles without a currently visible offer remain private. This
-- SECURITY DEFINER helper avoids profiles -> products -> profiles RLS recursion.
CREATE OR REPLACE FUNCTION public.has_public_active_offer(p_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.seller_id = p_profile
      AND p.status = 'active'
      AND p.deleted_at IS NULL
      AND (p.expires_at IS NULL OR p.expires_at > now())
  );
$$;

REVOKE ALL ON FUNCTION public.has_public_active_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_active_offer(uuid)
  TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Profiles are viewable by audience" ON public.profiles;
CREATE POLICY "Profiles are viewable by audience" ON public.profiles
  FOR SELECT USING (
    id = (select auth.uid())
    OR role = 'seller'
    OR (role IN ('admin', 'superadmin') AND public.has_public_active_offer(id))
    OR public.shares_coupon_with(id)
    OR public.is_admin_for_institution(institution_id)
    OR (select auth.role()) = 'service_role'
  );

-- Keep the existing bucket and user-folder boundary. Only the allowed
-- company-capable roles expand; admins cannot write another person's photos.
DROP POLICY IF EXISTS "Sellers upload own product images" ON storage.objects;
CREATE POLICY "Sellers upload own product images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND role IN ('seller', 'admin', 'superadmin')
    )
  );

DROP POLICY IF EXISTS "Sellers delete own product images" ON storage.objects;
CREATE POLICY "Sellers delete own product images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND role IN ('seller', 'admin', 'superadmin')
    )
  );

COMMIT;
