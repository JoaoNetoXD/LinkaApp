-- ====================================================================
-- SCRIPT DE BANCO DE DADOS SUPABASE PARA O APP "LINKA"
-- Copie todo este código e cole no "SQL Editor" do seu painel Supabase
-- e clique em "Run" (Executar).
-- ====================================================================

-- 1. Habilitar a extensão para geração de UUIDs (IDs únicos)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================================================
-- TABELAS (SCHEMA)
-- ====================================================================

-- 2. Tabela de Perfis (Profiles)
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Categorias
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_slots INTEGER DEFAULT 5,
  duration_hours INTEGER DEFAULT 24,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Produtos / Ofertas (Ads)
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
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabela de Pagamentos (Pedidos via Mercado Pago)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  method TEXT CHECK (method IN ('pix', 'credit_card')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  external_reference TEXT, -- ID do Mercado Pago (Preference ID ou Payment ID)
  qr_code_string TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Tabela de Cupons
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


-- ====================================================================
-- DADOS INICIAIS (SEED DATA)
-- ====================================================================

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
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- Políticas (Policies) para Profiles
-- --------------------------------------------------------------------
-- Qualquer pessoa autenticada ou não pode ver o perfil (necessário para ver quem é o vendedor)
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
-- O usuário logado só pode modificar o próprio perfil
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- --------------------------------------------------------------------
-- Políticas (Policies) para Categories
-- --------------------------------------------------------------------
CREATE POLICY "Categories are viewable by everyone" ON categories FOR SELECT USING (true);

-- --------------------------------------------------------------------
-- Políticas (Policies) para Products
-- --------------------------------------------------------------------
-- Todo mundo pode ver produtos que estão "ativos"
CREATE POLICY "Active products are viewable by everyone" ON products FOR SELECT USING (status = 'active');
-- Vendedores podem ver todos os seus próprios produtos, independente do status (pending, rejected, etc)
CREATE POLICY "Sellers can view own products" ON products FOR SELECT USING (auth.uid() = seller_id);
-- Vendedores podem criar novos produtos e definir eles mesmos como o seller_id
CREATE POLICY "Sellers can insert products" ON products FOR INSERT WITH CHECK (auth.uid() = seller_id);
-- Vendedores podem atualizar seus próprios produtos
CREATE POLICY "Sellers can update own products" ON products FOR UPDATE USING (auth.uid() = seller_id);

-- --------------------------------------------------------------------
-- Políticas (Policies) para Payments
-- --------------------------------------------------------------------
-- Compradores podem ver seus próprios pagamentos
CREATE POLICY "Buyers view own payments" ON payments FOR SELECT USING (auth.uid() = buyer_id);
-- Compradores inserem intenções de pagamento
CREATE POLICY "Buyers insert own payments" ON payments FOR INSERT WITH CHECK (auth.uid() = buyer_id);

-- --------------------------------------------------------------------
-- Políticas (Policies) para Coupons
-- --------------------------------------------------------------------
-- Compradores podem ver os cupons que eles compraram
CREATE POLICY "Buyers view own coupons" ON coupons FOR SELECT USING (auth.uid() = buyer_id);
-- Vendedores podem ver os cupons emitidos para os produtos deles
CREATE POLICY "Sellers view own product coupons" ON coupons FOR SELECT USING (auth.uid() = seller_id);
-- Vendedores podem atualizar os cupons dos produtos deles (para marcar como 'used' quando validarem)
CREATE POLICY "Sellers update own product coupons" ON coupons FOR UPDATE USING (auth.uid() = seller_id);


-- ====================================================================
-- TRIGGERS / FUNÇÕES AUTOMÁTICAS
-- ====================================================================

-- Função para injetar um Perfil automaticamente assim que o usuário faz o cadastro no Auth (Sign Up)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email, 'buyer');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Gatilho atrelado ao Auth do Supabase
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
