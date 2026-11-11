ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS offer_duration_hours integer
  CHECK (offer_duration_hours BETWEEN 1 AND 8760);
