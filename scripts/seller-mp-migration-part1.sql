CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.seller_payment_accounts (
  seller_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mercado_pago' CHECK (provider = 'mercado_pago'),
  access_token text NOT NULL,
  refresh_token text,
  token_type text,
  scope text,
  collector_id text,
  public_key text,
  live_mode boolean DEFAULT false,
  expires_at timestamptz,
  connected_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_oauth_states (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mercado_pago' CHECK (provider = 'mercado_pago'),
  state text NOT NULL UNIQUE,
  code_verifier text,
  redirect_to text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  used_at timestamptz
);

ALTER TABLE public.payment_oauth_states ADD COLUMN IF NOT EXISTS code_verifier text;

ALTER TABLE public.seller_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS seller_payment_accounts_provider_idx
  ON public.seller_payment_accounts(provider);
CREATE INDEX IF NOT EXISTS payment_oauth_states_state_idx
  ON public.payment_oauth_states(state);
CREATE INDEX IF NOT EXISTS payment_oauth_states_seller_idx
  ON public.payment_oauth_states(seller_id);

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS product_title text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS buyer_name text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS mercado_pago_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS preference_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS platform_fee numeric(10, 2) DEFAULT 0;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS seller_amount numeric(10, 2) DEFAULT 0;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS product_snapshot jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS payments_seller_idx ON public.payments(seller_id);
CREATE INDEX IF NOT EXISTS payments_mercado_pago_idx ON public.payments(mercado_pago_id);
CREATE INDEX IF NOT EXISTS payments_preference_idx ON public.payments(preference_id);
CREATE INDEX IF NOT EXISTS payments_external_reference_idx ON public.payments(external_reference);
CREATE UNIQUE INDEX IF NOT EXISTS coupons_payment_unique_idx
  ON public.coupons(payment_id)
  WHERE payment_id IS NOT NULL;

REVOKE ALL ON public.seller_payment_accounts FROM anon, authenticated;
REVOKE ALL ON public.payment_oauth_states FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_payment_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_oauth_states TO service_role;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO service_role;

DROP POLICY IF EXISTS "Payments are viewable by participants" ON public.payments;
CREATE POLICY "Payments are viewable by participants" ON public.payments
  FOR SELECT USING (
    buyer_id = (select auth.uid())
    OR seller_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'admin'
    )
    OR (select auth.role()) = 'service_role'
  );

