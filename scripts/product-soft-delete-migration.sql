-- Soft delete para anuncios do vendedor.
-- Rode uma vez no SQL Editor do Supabase se o projeto ainda nao tiver deleted_at em products.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS products_seller_visible_idx
  ON public.products (seller_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS products_institution_visible_idx
  ON public.products (institution_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
