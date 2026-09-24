-- ============================================================
-- EMPREENDE iCEV - Fix de permissões para Pix, pagamentos e cupons
-- Cole no SQL Editor do Supabase e execute uma vez em producao.
-- Corrige: permission denied for function register_payment_intent
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- A criacao do Pix chama esta RPC usando o JWT do comprador.
-- A funcao continua protegida por SECURITY DEFINER + auth.uid().
REVOKE ALL ON FUNCTION public.register_payment_intent(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_payment_intent(uuid, text, text, text, text, text, text) TO authenticated, service_role;

-- O cupom e emitido pelo backend/webhook quando o pagamento e confirmado.
REVOKE ALL ON FUNCTION public.issue_coupon_for_payment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_coupon_for_payment(uuid) TO service_role;

-- Atualizacoes auxiliares usadas pelo backend/webhook.
REVOKE ALL ON FUNCTION public.increment_slots(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_slots(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.increment_clicks(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_clicks(uuid) TO service_role;

-- Compradores consultam pagamentos, mas nunca inserem ou alteram status diretamente.
GRANT SELECT ON public.payments TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payments TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.coupons TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.products TO authenticated, service_role;

-- Apenas a service role escreve pagamentos; a RPC SECURITY DEFINER cria intencoes.
DROP POLICY IF EXISTS "Buyers insert own payments" ON public.payments;

DROP POLICY IF EXISTS "Service role manages payments" ON public.payments;
CREATE POLICY "Service role manages payments" ON public.payments
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Participants update own payments" ON public.payments;
