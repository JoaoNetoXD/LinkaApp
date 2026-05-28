-- ============================================================
-- LINKA - Fix de permissoes para Pix, pagamentos e cupons
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

-- Grants basicos de tabela. RLS continua decidindo o que cada usuario pode ver/alterar.
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.coupons TO authenticated, service_role;
GRANT SELECT, UPDATE ON public.products TO authenticated, service_role;

-- Policies idempotentes para participantes do pagamento.
DROP POLICY IF EXISTS "Buyers insert own payments" ON public.payments;
CREATE POLICY "Buyers insert own payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = buyer_id);

DROP POLICY IF EXISTS "Service role manages payments" ON public.payments;
CREATE POLICY "Service role manages payments" ON public.payments
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Participants update own payments" ON public.payments;
CREATE POLICY "Participants update own payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (
    buyer_id = (select auth.uid())
    OR seller_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    buyer_id = (select auth.uid())
    OR seller_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role = 'admin'
    )
  );
