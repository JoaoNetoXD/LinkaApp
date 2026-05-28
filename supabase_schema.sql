-- ====================================================================
-- SCRIPT DE BANCO DE DADOS SUPABASE PARA O APP "LINKA" (v1.1)
-- Copie todo este código e cole no "SQL Editor" do seu painel Supabase
-- e clique em "Run" (Executar).
-- ====================================================================

-- 1. Habilitar a extensão para geração de UUIDs (IDs únicos)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- TABELAS (SCHEMA)
-- ====================================================================

-- 2. Tabela de Instituições (Multi-tenant)
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  full_name TEXT,
  domain TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#2563eb',
  plan TEXT DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'enterprise')),
  settings JSONB DEFAULT '{"auto_approve_threshold": 5, "require_minor_consent": true, "max_slots_per_category": 5}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Perfis (Profiles)
-- Estende a tabela padrão auth.users do Supabase
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  whatsapp TEXT,
  avatar TEXT,
  role TEXT DEFAULT 'buyer' CHECK (role IN ('buyer', 'seller', 'admin')),
  course TEXT,
  semester TEXT,
  verified BOOLEAN DEFAULT false,
  institution_id UUID REFERENCES institutions(id),
  push_subscription JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Categorias
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_slots INTEGER DEFAULT 5,
  duration_hours INTEGER DEFAULT 24,
  institution_id UUID REFERENCES institutions(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabela de Produtos / Ofertas (Ads)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category_id TEXT REFERENCES categories(id) NOT NULL,
  original_price DECIMAL(10, 2) NOT NULL,
  discount INTEGER DEFAULT 0,
  discount_price DECIMAL(10, 2) NOT NULL,
  images TEXT[] DEFAULT '{}',
  slots_total INTEGER DEFAULT 5,
  slots_used INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'queue', 'expired', 'rejected')),
  rejection_reason TEXT,
  clicks INTEGER DEFAULT 0,
  institution_id UUID REFERENCES institutions(id),
  expires_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Tabela de Pagamentos (Pedidos via Mercado Pago)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  method TEXT CHECK (method IN ('pix', 'credit_card')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  external_reference TEXT,
  qr_code_string TEXT,
  platform_fee DECIMAL(10, 2) DEFAULT 0,
  seller_amount DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Tabela de Cupons
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  buyer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  valid_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Tabela de Notificações
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  institution_id UUID REFERENCES institutions(id),
  title TEXT NOT NULL,
  body TEXT,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  read BOOLEAN DEFAULT false,
  action_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Credenciais privadas de recebimento dos vendedores
-- Sem policies de SELECT/INSERT/UPDATE: somente backend com service_role acessa.
CREATE TABLE IF NOT EXISTS seller_payment_accounts (
  seller_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mercado_pago' CHECK (provider = 'mercado_pago'),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT,
  scope TEXT,
  collector_id TEXT,
  public_key TEXT,
  live_mode BOOLEAN DEFAULT false,
  expires_at TIMESTAMP WITH TIME ZONE,
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_oauth_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'mercado_pago' CHECK (provider = 'mercado_pago'),
  state TEXT NOT NULL UNIQUE,
  redirect_to TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  used_at TIMESTAMP WITH TIME ZONE
);

-- Ajustes para o fluxo real de pagamentos
ALTER TABLE payments ADD COLUMN IF NOT EXISTS mercado_pago_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS preference_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS buyer_name TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS product_title TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS product_snapshot JSONB DEFAULT '{}'::jsonb;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qr_code_string TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS payments_mercado_pago_id_idx
  ON payments (mercado_pago_id) WHERE mercado_pago_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_preference_id_idx
  ON payments (preference_id) WHERE preference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payments_external_reference_idx
  ON payments (external_reference) WHERE external_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS seller_payment_accounts_provider_idx ON seller_payment_accounts(provider);
CREATE INDEX IF NOT EXISTS payment_oauth_states_state_idx ON payment_oauth_states(state);
CREATE INDEX IF NOT EXISTS payment_oauth_states_seller_idx ON payment_oauth_states(seller_id);
CREATE INDEX IF NOT EXISTS products_seller_visible_idx
  ON products (seller_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS products_institution_visible_idx
  ON products (institution_id, status, created_at DESC) WHERE deleted_at IS NULL;


-- ====================================================================
-- FUNÇÕES AUXILIARES (RPC)
-- ====================================================================

-- Função para incrementar cliques de um produto
CREATE OR REPLACE FUNCTION increment_clicks(product_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE products SET clicks = clicks + 1 WHERE id = product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para incrementar slots usados
CREATE OR REPLACE FUNCTION increment_slots(product_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE products SET slots_used = slots_used + 1 WHERE id = product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualiza o timestamp automaticamente
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Protege o papel do perfil
CREATE OR REPLACE FUNCTION enforce_profile_role_rules()
RETURNS trigger AS $$
DECLARE
  caller_uid UUID := auth.uid();
  request_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(auth.role(), ''),
    current_role,
    ''
  );
  is_privileged_context BOOLEAN := caller_uid IS NULL AND request_role NOT IN ('anon', 'authenticated');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role NOT IN ('buyer', 'seller', 'admin') THEN
      NEW.role := 'buyer';
    END IF;
    IF NEW.role = 'admin' AND request_role <> 'service_role' AND NOT is_privileged_context THEN
      NEW.role := 'buyer';
    END IF;
    IF NEW.name IS NULL OR NEW.name = '' THEN
      NEW.name := COALESCE(NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'Usuário');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF request_role = 'service_role' OR is_privileged_context THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1 FROM profiles
      WHERE id = caller_uid AND role = 'admin'
    ) THEN
      RETURN NEW;
    END IF;

    NEW.role := OLD.role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Protege campos de sistema dos anúncios
CREATE OR REPLACE FUNCTION enforce_product_rules()
RETURNS trigger AS $$
DECLARE
  caller_role TEXT := COALESCE(auth.role(), '');
  is_admin BOOLEAN := EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF caller_role <> 'service_role' THEN
      NEW.seller_id := auth.uid();
      NEW.status := 'pending';
    END IF;
    NEW.slots_total := COALESCE(NEW.slots_total, 5);
    NEW.slots_used := COALESCE(NEW.slots_used, 0);
    NEW.clicks := COALESCE(NEW.clicks, 0);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT is_admin AND caller_role <> 'service_role' THEN
    NEW.seller_id := OLD.seller_id;
    NEW.slots_total := OLD.slots_total;
    NEW.clicks := OLD.clicks;
    NEW.institution_id := OLD.institution_id;
    NEW.rejection_reason := OLD.rejection_reason;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (NEW.status = 'pending' AND OLD.status IN ('expired', 'rejected')) THEN
        NEW.status := OLD.status;
      END IF;
    END IF;

    IF NOT (NEW.status = 'pending' AND OLD.status IN ('expired', 'rejected')) THEN
      NEW.slots_used := OLD.slots_used;
      NEW.expires_at := OLD.expires_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Registra a intenção de pagamento com valores calculados no servidor
CREATE OR REPLACE FUNCTION register_payment_intent(
  p_product_id UUID,
  p_method TEXT,
  p_coupon_code TEXT DEFAULT NULL,
  p_mercado_pago_id TEXT DEFAULT NULL,
  p_preference_id TEXT DEFAULT NULL,
  p_qr_code_string TEXT DEFAULT NULL,
  p_external_reference TEXT DEFAULT NULL
)
RETURNS payments AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_product products%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_amount NUMERIC(10, 2);
  v_fee NUMERIC(10, 2) := 0;
  v_seller_amount NUMERIC(10, 2);
  v_external_reference TEXT;
  v_snapshot JSONB;
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
  v_external_reference := COALESCE(p_external_reference, 'linka_' || v_product.id::text || '_' || auth.uid()::text || '_' || FLOOR(EXTRACT(EPOCH FROM NOW()) * 1000)::bigint::text);
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.register_payment_intent(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_payment_intent(uuid, text, text, text, text, text, text) TO authenticated, service_role;

-- Emite cupom quando o pagamento é confirmado
CREATE OR REPLACE FUNCTION issue_coupon_for_payment(p_payment_id UUID)
RETURNS coupons AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_coupon coupons%ROWTYPE;
  v_code TEXT;
  v_is_admin BOOLEAN := EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_payment
  FROM payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado';
  END IF;

  IF v_payment.buyer_id <> auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF v_payment.status <> 'paid' THEN
    RAISE EXCEPTION 'Pagamento ainda não confirmado';
  END IF;

  SELECT * INTO v_coupon
  FROM coupons
  WHERE payment_id = v_payment.id
  LIMIT 1;

  IF FOUND THEN
    UPDATE payments
    SET coupon_id = v_coupon.id,
        coupon_code = v_coupon.code,
        updated_at = NOW()
    WHERE id = v_payment.id;

    RETURN v_coupon;
  END IF;

  FOR i IN 1..5 LOOP
    v_code := 'LK' || UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::text, '-', '') FROM 1 FOR 6));
    BEGIN
      INSERT INTO coupons (
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
        NOW() + INTERVAL '24 hours'
      )
      RETURNING * INTO v_coupon;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF i = 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  UPDATE payments
  SET coupon_id = v_coupon.id,
      coupon_code = v_coupon.code,
      updated_at = NOW()
  WHERE id = v_payment.id;

  UPDATE products
  SET slots_used = COALESCE(slots_used, 0) + 1
  WHERE id = v_payment.product_id;

  RETURN v_coupon;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.issue_coupon_for_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_coupon_for_payment(uuid) TO authenticated, service_role;


-- ====================================================================
-- DADOS INICIAIS (SEED DATA)
-- ====================================================================

-- Instituição piloto
INSERT INTO institutions (id, name, full_name, domain, primary_color, plan) VALUES
('00000000-0000-0000-0000-000000000001', 'iCEV', 'Instituto de Ensino Superior iCEV', '@icev.edu.br', '#2563eb', 'pro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, name, max_slots, duration_hours) VALUES
('food', 'Lanches & Bebidas', 5, 12),
('fashion', 'Moda & Acessórios', 5, 24),
('services', 'Serviços Presenciais', 5, 24),
('digital', 'Digital & Criativo', 5, 24),
('others', 'Outros', 5, 24)
ON CONFLICT (id) DO NOTHING;


-- ====================================================================
-- SEGURANÇA (ROW LEVEL SECURITY - RLS)
-- ====================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_oauth_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Institutions are viewable by everyone" ON institutions;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can manage own profile" ON profiles;
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON categories;
DROP POLICY IF EXISTS "Products are viewable by audience" ON products;
DROP POLICY IF EXISTS "Sellers can insert products" ON products;
DROP POLICY IF EXISTS "Products are writable by owner or admin" ON products;
DROP POLICY IF EXISTS "Payments are viewable by participants" ON payments;
DROP POLICY IF EXISTS "Buyers insert own payments" ON payments;
DROP POLICY IF EXISTS "Coupons are viewable by participants" ON coupons;
DROP POLICY IF EXISTS "Coupons are writable by seller or admin" ON coupons;
DROP POLICY IF EXISTS "Users view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;

CREATE POLICY "Institutions are viewable by everyone" ON institutions
  FOR SELECT USING (true);

CREATE POLICY "Profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can manage own profile" ON profiles
  FOR UPDATE TO authenticated USING (
    (select auth.uid()) = id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')
  )
  WITH CHECK (
    (select auth.uid()) = id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')
  );

CREATE POLICY "Categories are viewable by everyone" ON categories
  FOR SELECT USING (true);

CREATE POLICY "Products are viewable by audience" ON products
  FOR SELECT USING (
    status = 'active'
    OR seller_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')
    OR (select auth.role()) = 'service_role'
  );

CREATE POLICY "Sellers can insert products" ON products
  FOR INSERT WITH CHECK ((select auth.uid()) = seller_id AND status = 'pending');

CREATE POLICY "Products are writable by owner or admin" ON products
  FOR UPDATE USING (
    seller_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')
    OR (select auth.role()) = 'service_role'
  );

CREATE POLICY "Payments are viewable by participants" ON payments
  FOR SELECT USING (
    buyer_id = (select auth.uid())
    OR seller_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')
    OR (select auth.role()) = 'service_role'
  );

-- Buyers can insert their own payments (via SECURITY DEFINER fn, but also needed for direct insert fallback)
DROP POLICY IF EXISTS "Buyers insert own payments" ON payments;
CREATE POLICY "Buyers insert own payments" ON payments
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = buyer_id);

-- service_role can insert/update payments (webhooks, server)
DROP POLICY IF EXISTS "Service role manages payments" ON payments;
CREATE POLICY "Service role manages payments" ON payments
  FOR ALL USING ((select auth.role()) = 'service_role');

-- Buyers/sellers can update their own payments (status sync)
DROP POLICY IF EXISTS "Participants update own payments" ON payments;
CREATE POLICY "Participants update own payments" ON payments
  FOR UPDATE USING (
    buyer_id = (select auth.uid())
    OR seller_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')
    OR (select auth.role()) = 'service_role'
  );

CREATE POLICY "Coupons are viewable by participants" ON coupons
  FOR SELECT USING (
    buyer_id = (select auth.uid())
    OR seller_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')
    OR (select auth.role()) = 'service_role'
  );

CREATE POLICY "Coupons are writable by seller or admin" ON coupons
  FOR UPDATE USING (
    seller_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = (select auth.uid()) AND p.role = 'admin')
    OR (select auth.role()) = 'service_role'
  );

CREATE POLICY "Users view own notifications" ON notifications
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING ((select auth.uid()) = user_id);


-- ====================================================================
-- TRIGGERS / FUNÇÕES AUTOMÁTICAS
-- ====================================================================

-- Função para injetar um Perfil automaticamente assim que o usuário faz o cadastro no Auth (Sign Up)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  user_domain TEXT;
  inst_id UUID;
  user_name TEXT;
  user_role TEXT;
BEGIN
  -- Extract domain from email
  user_domain := '@' || split_part(new.email, '@', 2);
  
  -- Find institution by domain
  SELECT id INTO inst_id FROM institutions WHERE domain = user_domain LIMIT 1;
  user_name := COALESCE(NULLIF(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1), 'Usuário');
  user_role := LOWER(COALESCE(NULLIF(new.raw_user_meta_data->>'role', ''), 'buyer'));
  IF user_role NOT IN ('buyer', 'seller') THEN
    user_role := 'buyer';
  END IF;

  INSERT INTO public.profiles (id, name, email, role, institution_id)
  VALUES (new.id, user_name, new.email, user_role, inst_id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gatilho atrelado ao Auth do Supabase
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

DROP TRIGGER IF EXISTS profiles_role_guard ON profiles;
CREATE TRIGGER profiles_role_guard
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_profile_role_rules();

DROP TRIGGER IF EXISTS products_guard ON products;
CREATE TRIGGER products_guard
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION enforce_product_rules();

DROP TRIGGER IF EXISTS payments_touch_updated_at ON payments;
CREATE TRIGGER payments_touch_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Auto-expire products past their expiry date
CREATE OR REPLACE FUNCTION auto_expire_products()
RETURNS void AS $$
BEGIN
  UPDATE products SET status = 'expired'
  WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-expire old coupons
CREATE OR REPLACE FUNCTION auto_expire_coupons()
RETURNS void AS $$
BEGIN
  UPDATE coupons SET status = 'expired'
  WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bloqueia reutilização ou validação tardia de cupons
CREATE OR REPLACE FUNCTION public.prevent_coupon_reuse()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'used' THEN
    IF OLD.status = 'used' OR OLD.used_at IS NOT NULL THEN
      RAISE EXCEPTION 'Este cupom ja foi utilizado';
    END IF;

    IF OLD.status = 'expired' OR (OLD.valid_until IS NOT NULL AND OLD.valid_until < NOW()) THEN
      RAISE EXCEPTION 'Este cupom esta expirado';
    END IF;

    NEW.used_at := COALESCE(NEW.used_at, NOW());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_coupon_reuse_before_update ON public.coupons;
CREATE TRIGGER prevent_coupon_reuse_before_update
BEFORE UPDATE ON public.coupons
FOR EACH ROW
EXECUTE FUNCTION public.prevent_coupon_reuse();


-- ====================================================================
-- STORAGE BUCKET (execute no Dashboard do Supabase > Storage)
-- ====================================================================
-- Crie manualmente um bucket chamado "product-images" com:
--   - Public: true
--   - File size limit: 5MB
--   - Allowed MIME types: image/jpeg, image/png, image/webp, image/gif
