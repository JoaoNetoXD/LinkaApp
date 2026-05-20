ALTER TABLE public.payment_oauth_states
  ADD COLUMN IF NOT EXISTS code_verifier text;
