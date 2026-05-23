-- Security hardening applied through Supabase MCP on 2026-05-23.
-- Keeps Mercado Pago OAuth/payment account tables unreachable from the browser
-- while preserving backend access through the Supabase service role.

ALTER FUNCTION public.enforce_profile_role_rules()
SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.increment_clicks(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_clicks(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_clicks(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_clicks(uuid) TO service_role;

DROP POLICY IF EXISTS "No direct client access to seller payment accounts" ON public.seller_payment_accounts;
CREATE POLICY "No direct client access to seller payment accounts"
ON public.seller_payment_accounts
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "No direct client access to payment oauth states" ON public.payment_oauth_states;
CREATE POLICY "No direct client access to payment oauth states"
ON public.payment_oauth_states
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
