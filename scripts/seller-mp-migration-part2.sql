CREATE OR REPLACE FUNCTION register_payment_intent(
  p_product_id uuid,
  p_method text,
  p_coupon_code text DEFAULT NULL,
  p_mercado_pago_id text DEFAULT NULL,
  p_preference_id text DEFAULT NULL,
  p_qr_code_string text DEFAULT NULL,
  p_external_reference text DEFAULT NULL
)
RETURNS public.payments AS $linka_register_payment_intent$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
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
  FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto nao encontrado';
  END IF;

  IF v_product.status <> 'active' THEN
    RAISE EXCEPTION 'Produto indisponivel para pagamento';
  END IF;

  IF COALESCE(v_product.slots_used, 0) >= COALESCE(v_product.slots_total, 5) THEN
    RAISE EXCEPTION 'Produto esgotado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.seller_payment_accounts
    WHERE seller_id = v_product.seller_id
      AND provider = 'mercado_pago'
      AND access_token IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Vendedor sem Mercado Pago conectado';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil nao encontrado';
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
  FROM public.payments
  WHERE (p_external_reference IS NOT NULL AND external_reference = p_external_reference)
     OR (p_mercado_pago_id IS NOT NULL AND mercado_pago_id = p_mercado_pago_id)
     OR (p_preference_id IS NOT NULL AND preference_id = p_preference_id)
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.payments
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

  INSERT INTO public.payments (
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
$linka_register_payment_intent$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION register_payment_intent(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION register_payment_intent(uuid, text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION issue_coupon_for_payment(p_payment_id uuid)
RETURNS public.coupons AS $linka_issue_coupon_for_payment$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_code text;
  v_is_admin boolean := EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento nao encontrado';
  END IF;

  IF v_payment.buyer_id <> auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF v_payment.status <> 'paid' THEN
    RAISE EXCEPTION 'Pagamento ainda nao confirmado';
  END IF;

  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE payment_id = v_payment.id
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.payments
    SET coupon_id = v_coupon.id,
        coupon_code = v_coupon.code,
        updated_at = now()
    WHERE id = v_payment.id;

    RETURN v_coupon;
  END IF;

  FOR i IN 1..5 LOOP
    v_code := 'LK' || upper(substring(replace(uuid_generate_v4()::text, '-', '') from 1 for 6));
    BEGIN
      INSERT INTO public.coupons (
        code,
        product_id,
        buyer_id,
        seller_id,
        payment_id,
        status,
        valid_until
      ) VALUES (
        v_code,
        v_payment.product_id,
        v_payment.buyer_id,
        v_payment.seller_id,
        v_payment.id,
        'active',
        now() + interval '24 hours'
      )
      RETURNING * INTO v_coupon;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF i = 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  UPDATE public.payments
  SET coupon_id = v_coupon.id,
      coupon_code = v_coupon.code,
      updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.products
  SET slots_used = COALESCE(slots_used, 0) + 1
  WHERE id = v_payment.product_id;

  RETURN v_coupon;
END;
$linka_issue_coupon_for_payment$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION issue_coupon_for_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION issue_coupon_for_payment(uuid) TO authenticated;

UPDATE public.payments
SET platform_fee = 0,
    seller_amount = amount
WHERE platform_fee IS DISTINCT FROM 0
   OR seller_amount IS DISTINCT FROM amount;

