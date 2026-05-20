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
  redirect_to text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  used_at timestamptz
);

ALTER TABLE public.seller_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS seller_payment_accounts_provider_idx
  ON public.seller_payment_accounts(provider);
CREATE INDEX IF NOT EXISTS payment_oauth_states_state_idx
  ON public.payment_oauth_states(state);
CREATE INDEX IF NOT EXISTS payment_oauth_states_seller_idx
  ON public.payment_oauth_states(seller_id);

CREATE OR REPLACE FUNCTION register_payment_intent(
  p_product_id uuid,
  p_method text,
  p_coupon_code text DEFAULT NULL,
  p_mercado_pago_id text DEFAULT NULL,
  p_preference_id text DEFAULT NULL,
  p_qr_code_string text DEFAULT NULL,
  p_external_reference text DEFAULT NULL
)
RETURNS payments AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_product products%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_amount numeric(10, 2);
  v_fee numeric(10, 2) := 0;
  v_seller_amount numeric(10, 2);
  v_external_reference text;
  v_snapshot jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_product
  FROM products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  SELECT * INTO v_profile
  FROM profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  v_amount := COALESCE(v_product.discount_price, v_product.original_price);
  v_seller_amount := v_amount;
  v_external_reference := COALESCE(
    p_external_reference,
    'linka_' || v_product.id::text || '_' || auth.uid()::text || '_' || FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint::text
  );
  v_snapshot := jsonb_build_object(
    'id', v_product.id,
    'title', v_product.title,
    'description', v_product.description,
    'category_id', v_product.category_id,
    'original_price', v_product.original_price,
    'discount', v_product.discount,
    'discount_price', v_product.discount_price,
    'images', COALESCE(v_product.images, '{}'),
    'seller_id', v_product.seller_id,
    'institution_id', v_product.institution_id
  );

  SELECT *
  INTO v_payment
  FROM payments
  WHERE (p_external_reference IS NOT NULL AND external_reference = p_external_reference)
     OR (p_mercado_pago_id IS NOT NULL AND mercado_pago_id = p_mercado_pago_id)
     OR (p_preference_id IS NOT NULL AND preference_id = p_preference_id)
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE payments
    SET
      buyer_name = COALESCE(v_payment.buyer_name, v_profile.name),
      seller_id = v_product.seller_id,
      product_title = v_product.title,
      product_snapshot = v_snapshot,
      amount = v_amount,
      platform_fee = v_fee,
      seller_amount = v_seller_amount,
      method = COALESCE(p_method, v_payment.method),
      coupon_code = COALESCE(p_coupon_code, v_payment.coupon_code),
      mercado_pago_id = COALESCE(p_mercado_pago_id, v_payment.mercado_pago_id),
      preference_id = COALESCE(p_preference_id, v_payment.preference_id),
      qr_code_string = COALESCE(p_qr_code_string, v_payment.qr_code_string),
      external_reference = COALESCE(v_payment.external_reference, v_external_reference),
      updated_at = NOW()
    WHERE id = v_payment.id
    RETURNING * INTO v_payment;

    RETURN v_payment;
  END IF;

  INSERT INTO payments (
    buyer_id,
    seller_id,
    product_id,
    product_title,
    buyer_name,
    amount,
    method,
    status,
    external_reference,
    mercado_pago_id,
    preference_id,
    qr_code_string,
    coupon_code,
    platform_fee,
    seller_amount,
    product_snapshot
  ) VALUES (
    auth.uid(),
    v_product.seller_id,
    v_product.id,
    v_product.title,
    v_profile.name,
    v_amount,
    p_method,
    'pending',
    v_external_reference,
    p_mercado_pago_id,
    p_preference_id,
    p_qr_code_string,
    p_coupon_code,
    v_fee,
    v_seller_amount,
    v_snapshot
  )
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION register_payment_intent(uuid, text, text, text, text, text, text) TO authenticated;

UPDATE public.payments
SET platform_fee = 0,
    seller_amount = amount
WHERE platform_fee IS DISTINCT FROM 0
   OR seller_amount IS DISTINCT FROM amount;
