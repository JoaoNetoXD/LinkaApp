import { supabase } from '../lib/supabase.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function cleanUrl(url = '') {
  return String(url || '').trim().replace(/\/+$/, '');
}

function getPublicAppUrl() {
  const configuredUrl = cleanUrl(
    import.meta.env.VITE_APP_URL
    || import.meta.env.VITE_PUBLIC_APP_URL
    || import.meta.env.VITE_FRONTEND_URL
    || ''
  );
  if (configuredUrl) return configuredUrl;

  // Without VITE_APP_URL, e-mail links return to the site the person is using
  // (localhost during development is allowed in Supabase Auth redirect URLs).
  return cleanUrl(window.location.origin);
}

function getEmailRedirectTo(role = 'buyer') {
  const accountRole = normalizeRole(role);
  const target = accountRole === 'seller' ? 'seller' : 'buyer';
  const params = new URLSearchParams({
    confirmed: '1',
    role: accountRole,
    next: target,
  });
  return `${getPublicAppUrl()}/#/auth?${params.toString()}`;
}

function getPasswordRecoveryRedirectTo() {
  const params = new URLSearchParams({
    reset: '1',
  });
  return `${getPublicAppUrl()}/#/auth?${params.toString()}`;
}

export function getHomePathForRole(role = 'buyer') {
  if (role === 'admin' || role === 'superadmin') return '#/admin';
  if (role === 'seller') return '#/seller';
  return '#/buyer';
}

function normalizeRole(role) {
  return role === 'seller' || role === 'admin' || role === 'superadmin' ? role : 'buyer';
}

function translateAuthError(message = '') {
  const normalized = String(message || '').toLowerCase();
  if (!normalized) return 'Não foi possível concluir a autenticação.';

  const knownMessages = [
    {
      match: ['invalid login credentials', 'invalid credentials'],
      text: 'E-mail ou senha incorretos. Confira os dados e tente novamente.',
    },
    {
      match: ['email not confirmed', 'email confirmation'],
      text: 'Confirme seu e-mail antes de entrar.',
    },
    {
      match: ['user already registered', 'already registered', 'already exists'],
      text: 'Já existe uma conta com este e-mail. Faça login ou use outro e-mail.',
    },
    {
      match: ['password should be at least', 'weak password'],
      text: 'A senha precisa ter pelo menos 6 caracteres.',
    },
    {
      match: ['same password', 'different from the old password'],
      text: 'Use uma senha diferente da senha atual.',
    },
    {
      match: ['password recovery', 'recovery session', 'session missing', 'auth session missing'],
      text: 'Abra novamente o link enviado por e-mail para redefinir sua senha.',
    },
    {
      match: ['unable to validate email address', 'invalid email'],
      text: 'Informe um e-mail válido.',
    },
    {
      match: ['signup is disabled', 'signups not allowed'],
      text: 'O cadastro está desativado neste projeto. Verifique as configurações do Supabase.',
    },
    {
      match: ['email rate limit exceeded', 'rate limit', 'security purposes'],
      text: 'O envio de e-mails atingiu o limite temporário. Aguarde alguns minutos antes de tentar de novo.',
    },
    {
      match: ['database error saving new user', 'database error'],
      text: 'Não foi possível salvar seu perfil agora. Tente novamente em instantes.',
    },
    {
      match: ['network', 'failed to fetch', 'fetch'],
      text: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
    },
  ];

  const found = knownMessages.find((item) => item.match.some((part) => normalized.includes(part)));
  return found?.text || 'Não foi possível concluir a autenticação. Revise os dados e tente novamente.';
}

export async function ensureUserProfile(user, fallbackRole = 'buyer', extra = {}) {
  if (!user?.id) return null;

  try {
    const existing = await getCurrentProfile(user.id);
    if (existing) return existing;

    const role = normalizeRole(fallbackRole);
    const profile = {
      id: user.id,
      email: user.email,
      name: extra.fullName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário',
      role: role === 'admin' || role === 'superadmin' ? 'buyer' : role,
      whatsapp: extra.whatsapp || user.user_metadata?.whatsapp || null,
    };

    const { data, error } = await supabase
      .from('profiles')
      .insert(profile)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return data || profile;
  } catch (err) {
    console.warn('ensureUserProfile failed:', err.message);
    return null;
  }
}

export async function signUpUser(email, password, fullName, role = 'buyer', extra = {}) {
  try {
    const accountRole = role === 'seller' ? 'seller' : 'buyer';
    const roleLabel = accountRole === 'seller' ? 'empresa' : 'aluno';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getEmailRedirectTo(accountRole),
        data: {
          full_name: fullName,
          role: accountRole,
          role_label: roleLabel,
          app_name: 'Empreende iCEV',
          confirmation_context: accountRole === 'seller'
            ? 'Confirme seu e-mail para ativar sua empresa no Empreende iCEV.'
            : 'Confirme seu e-mail para pegar cupons das empresas dos colegas no Empreende iCEV.',
          whatsapp: extra.whatsapp || '',
        },
      },
    });

    if (error) throw error;

    const profile = data?.session && data?.user
      ? await ensureUserProfile(data.user, accountRole, { fullName, whatsapp: extra.whatsapp })
      : null;

    return {
      success: true,
      data,
      profile,
      needsEmailConfirmation: Boolean(data?.user && !data?.session),
      homePath: getHomePathForRole(profile?.role || accountRole),
    };
  } catch (err) {
    console.error('Sign up error:', err.message);
    return { success: false, error: translateAuthError(err.message) };
  }
}

export async function signInUser(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    const profile = await ensureUserProfile(
      data.user,
      data.user?.user_metadata?.role || 'buyer',
      {
        fullName: data.user?.user_metadata?.full_name,
        whatsapp: data.user?.user_metadata?.whatsapp,
      }
    );

    return {
      success: true,
      data,
      profile,
      homePath: getHomePathForRole(profile?.role || data.user?.user_metadata?.role || 'buyer'),
    };
  } catch (err) {
    console.error('Sign in error:', err.message);
    return { success: false, error: translateAuthError(err.message) };
  }
}

export async function requestPasswordReset(email) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getPasswordRecoveryRedirectTo(),
    });

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Password reset request error:', err.message);
    return { success: false, error: translateAuthError(err.message) };
  }
}

export async function updateUserPassword(password) {
  try {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Password update error:', err.message);
    return { success: false, error: translateAuthError(err.message) };
  }
}

export async function signOutUser() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Sign out error:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getCurrentProfile(userId) {
  if (!userId) return null;
  // DEV-only screen preview: localStorage.empreende_dev_preview_role = 'seller' | 'admin' | 'superadmin'.
  // Stripped from production builds because import.meta.env.DEV is statically false there.
  if (import.meta.env.DEV) {
    const previewRole = localStorage.getItem('empreende_dev_preview_role');
    if (previewRole) {
      return {
        id: userId,
        role: normalizeRole(previewRole),
        name: 'Maria Clara Souza',
        full_name: 'Maria Clara Souza',
        email: 'maria.clara@icev.edu.br',
        whatsapp: '86999001122',
        institution_id: null,
      };
    }
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }
  return data;
}

export async function becomeSeller() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: 'AUTH_REQUIRED' };
    }

    const response = await fetch(`${API_URL}/profile/become-seller`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Não foi possível ativar o modo vendedor.');
    }
    return { success: true, profile: data.profile, homePath: getHomePathForRole(data.profile?.role || 'seller') };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}
