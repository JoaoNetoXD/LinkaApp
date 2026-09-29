-- ====================================================================
-- Empreende iCEV · ensaio da integrity-migration.sql com contas reais
-- Uso (SQL Editor): cole o miolo da integrity-migration.sql (entre BEGIN;
-- e COMMIT;, sem o bloco do pg_cron) e, logo depois, este arquivo, tudo
-- numa execução só. O RAISE no final desfaz tudo e mostra o resultado de
-- cada teste na mensagem de erro. Nada fica salvo.
-- ====================================================================
-- ====================================================================
-- ENSAIO: roda a migração e testa com contas reais. O RAISE no final
-- desfaz TUDO (a consulta inteira é uma transação só).
-- ====================================================================
DO $test$
DECLARE
  v_out TEXT := '';
  v_buyer UUID;
  v_inst UUID;
  v_product public.products%ROWTYPE;
  v_admin UUID;
  v_coupon public.coupons%ROWTYPE;
  v_coupon2 public.coupons%ROWTYPE;
  v_new public.products%ROWTYPE;
  v_after INT;
  v_n INT;
BEGIN
  SELECT id, institution_id INTO v_buyer, v_inst FROM public.profiles
   WHERE role = 'buyer' AND institution_id IS NOT NULL ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO v_product FROM public.products
   WHERE status = 'active' AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > now())
     AND institution_id = v_inst AND seller_id <> v_buyer
     AND public.live_coupon_count(id, batch_started_at) < COALESCE(slots_total, 0)
   ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO v_admin FROM public.profiles
   WHERE role IN ('admin', 'superadmin') ORDER BY (role = 'superadmin') DESC LIMIT 1;
  v_out := format('aluno: %s | oferta: %s (%s/%s) | admin: %s',
    v_buyer IS NOT NULL, v_product.title, v_product.slots_used, v_product.slots_total, v_admin IS NOT NULL);

  -- 1. Aluno pega cupom (e pede de novo)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_coupon := public.claim_coupon(v_product.id);
    v_coupon2 := public.claim_coupon(v_product.id);
    v_out := v_out || format(' || 1 cupom %s, mesmo codigo na 2a vez: %s, nome guardado: %s',
      v_coupon.code, v_coupon.code = v_coupon2.code, v_coupon.product_title = v_product.title);
  EXCEPTION WHEN OTHERS THEN
    v_out := v_out || format(' || 1 CUPOM FALHOU: %s', SQLERRM);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT slots_used INTO v_after FROM public.products WHERE id = v_product.id;
  v_out := v_out || format(' | estoque usado agora: %s', v_after);

  -- 2. Empresa tenta editar a oferta aprovada direto no banco
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_product.seller_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.products SET title = title || ' x' WHERE id = v_product.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || format(' || 2 edicao direta NAO bloqueada (linhas %s)', v_n);
  EXCEPTION WHEN OTHERS THEN
    v_out := v_out || format(' || 2 edicao direta bloqueada: %s', left(SQLERRM, 40));
  END;

  -- 3. Empresa cria oferta nova (o banco impõe pendente e limites da categoria)
  BEGIN
    INSERT INTO public.products (seller_id, title, description, category_id, original_price, discount, discount_price, images, status, slots_total)
    VALUES (v_product.seller_id, 'Ensaio de oferta', 'Oferta criada so para o ensaio.', v_product.category_id, 20, 20, 16, ARRAY[]::text[], 'active', 999)
    RETURNING * INTO v_new;
    v_out := v_out || format(' || 3 oferta criada: status %s, vagas %s', v_new.status, v_new.slots_total);
  EXCEPTION WHEN OTHERS THEN
    v_out := v_out || format(' || 3 CRIAR OFERTA FALHOU: %s', SQLERRM);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- 4. Admin aprova; empresa recebe aviso
  IF v_admin IS NOT NULL AND v_new.id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.products SET status = 'active', expires_at = now() + interval '7 days' WHERE id = v_new.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_out := v_out || format(' || 4 admin aprovou: linhas %s', v_n);
    EXCEPTION WHEN OTHERS THEN
      v_out := v_out || format(' || 4 APROVAR FALHOU: %s', SQLERRM);
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    SELECT count(*) INTO v_n FROM public.notifications
     WHERE user_id = v_product.seller_id AND title = 'Oferta aprovada' AND created_at >= now() - interval '1 minute';
    v_out := v_out || format(', aviso a empresa: %s', v_n);
  END IF;

  -- 5. Aluno edita o próprio perfil
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.profiles SET name = name, whatsapp = whatsapp WHERE id = v_buyer;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || format(' || 5 nome/whatsapp: linhas %s', v_n);
  EXCEPTION WHEN OTHERS THEN
    v_out := v_out || format(' || 5 EDITAR NOME FALHOU: %s', SQLERRM);
  END;
  BEGIN
    UPDATE public.profiles SET verified = true WHERE id = v_buyer;
    v_out := v_out || ' | marcar verificado: NAO bloqueado';
  EXCEPTION WHEN OTHERS THEN
    v_out := v_out || format(' | marcar verificado bloqueado: %s', left(SQLERRM, 30));
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- 6. Ofertas vencidas saem da vitrine
  SELECT count(*) INTO v_n FROM public.products WHERE status = 'active' AND expires_at <= now();
  v_out := v_out || format(' || 6 vencidas ainda ativas: %s', v_n);

  RAISE EXCEPTION 'ENSAIO OK, TUDO DESFEITO >> %', v_out;
END
$test$;
