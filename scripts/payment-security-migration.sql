-- Apply to existing Linka projects before enabling checkout.
ALTER TABLE public.payment_oauth_states ADD COLUMN IF NOT EXISTS code_verifier text;

REVOKE EXECUTE ON FUNCTION public.increment_clicks(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_clicks(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.increment_slots(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_slots(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.issue_coupon_for_payment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_coupon_for_payment(uuid) TO service_role;

DROP POLICY IF EXISTS "Buyers insert own payments" ON public.payments;
DROP POLICY IF EXISTS "Participants update own payments" ON public.payments;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.reject_cross_owner_payment_intent()
RETURNS trigger AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND
    (NEW.buyer_id IS DISTINCT FROM auth.uid() OR NEW.product_id IS DISTINCT FROM OLD.product_id) THEN
    RAISE EXCEPTION 'Intencao de pagamento pertence a outro comprador ou produto';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, auth;

DROP TRIGGER IF EXISTS reject_cross_owner_payment_intent ON public.payments;
CREATE TRIGGER reject_cross_owner_payment_intent
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.reject_cross_owner_payment_intent();

CREATE UNIQUE INDEX IF NOT EXISTS coupons_payment_id_unique_idx
ON public.coupons (payment_id) WHERE payment_id IS NOT NULL;
