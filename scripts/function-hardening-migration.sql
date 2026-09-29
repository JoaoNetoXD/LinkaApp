-- ====================================================================
-- Empreende iCEV · closes what the Supabase Security Advisor flagged
-- (2026-09-29):
--   * old helpers from the payment phase and the first expiry jobs could
--     be called by anyone through the API. Only the app's server (service
--     role) uses them; refresh_offers() replaced the expiry jobs.
--   * those helpers and touch_updated_at() had no fixed search_path.
-- Functions used by row-level security (is_admin_for_institution,
-- shares_coupon_with) and claim_coupon stay callable on purpose.
-- Idempotent: safe to run again. Skips functions that do not exist.
-- ====================================================================

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'auto_expire_products', 'auto_expire_coupons',
        'increment_clicks', 'increment_slots',
        'register_payment_intent', 'issue_coupon_for_payment',
        'touch_updated_at'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn.signature);
    IF fn.proname <> 'touch_updated_at' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
    END IF;
  END LOOP;
END;
$$;
