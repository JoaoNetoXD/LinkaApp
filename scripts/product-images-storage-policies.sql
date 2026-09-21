-- Run after creating the public product-images bucket in Supabase Storage.
-- Public reads are enabled by the bucket setting; writes remain restricted by RLS.
DROP POLICY IF EXISTS "Sellers upload own product images" ON storage.objects;
CREATE POLICY "Sellers upload own product images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND role = 'seller'
    )
  );

DROP POLICY IF EXISTS "Sellers view own product image objects" ON storage.objects;
CREATE POLICY "Sellers view own product image objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Sellers delete own product images" ON storage.objects;
CREATE POLICY "Sellers delete own product images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND role = 'seller'
    )
  );
