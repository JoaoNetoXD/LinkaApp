-- Linka: correcao do acesso admin e endurecimento do perfil.
-- Rode este arquivo no Supabase Dashboard > SQL Editor.

CREATE OR REPLACE FUNCTION public.enforce_profile_role_rules()
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
      NEW.name := COALESCE(NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'Usuario');
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF request_role = 'service_role' OR is_privileged_context THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = caller_uid AND role = 'admin'
    ) THEN
      RETURN NEW;
    END IF;

    NEW.role := OLD.role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_role_guard ON public.profiles;
CREATE TRIGGER profiles_role_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_role_rules();

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
CREATE POLICY "Users can manage own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    (select auth.uid()) = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) = id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid()) AND p.role = 'admin'
    )
  );

-- Depois de rodar a correcao acima, substitua o email abaixo e execute
-- o bloco para promover seu usuario real a admin.
/*
INSERT INTO public.profiles AS p (id, email, name, role)
SELECT
  u.id,
  u.email,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1), 'Admin'),
  'admin'
FROM auth.users u
WHERE lower(u.email) = lower('SEU_EMAIL_AQUI')
ON CONFLICT (id) DO UPDATE
SET role = 'admin',
    email = EXCLUDED.email,
    name = COALESCE(NULLIF(p.name, ''), EXCLUDED.name);

SELECT id, email, role
FROM public.profiles
WHERE lower(email) = lower('SEU_EMAIL_AQUI');
*/
