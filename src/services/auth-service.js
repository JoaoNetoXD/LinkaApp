import { supabase } from '../lib/supabase.js';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export function getHomePathForRole(role = 'buyer') {
  if (role === 'admin') return '#/admin';
  if (role === 'seller') return '#/seller';
  return '#/buyer';
}

function normalizeRole(role) {
  return role === 'seller' || role === 'admin' ? role : 'buyer';
}

function translateAuthError(message = '') {
  const normalized = String(message || '').toLowerCase();
  if (!normalized) return 'Nao foi possivel concluir a autenticacao.';

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
      text: 'Ja existe uma conta com este e-mail. Faca login ou use outro e-mail.',
    },
    {
      match: ['password should be at least', 'weak password'],
      text: 'A senha precisa ter pelo menos 6 caracteres.',
    },
    {
      match: ['unable to validate email address', 'invalid email'],
      text: 'Informe um e-mail valido.',
    },
    {
      match: ['signup is disabled', 'signups not allowed'],
      text: 'O cadastro esta desativado neste projeto. Verifique as configuracoes do Supabase.',
    },
    {
      match: ['email rate limit exceeded', 'rate limit', 'security purposes'],
      text: 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.',
    },
    {
      match: ['database error saving new user', 'database error'],
      text: 'Nao foi possivel salvar seu perfil agora. Tente novamente em instantes.',
    },
    {
      match: ['network', 'failed to fetch', 'fetch'],
      text: 'Nao foi possivel conectar ao servidor. Verifique sua conexao e tente novamente.',
    },
  ];

  const found = knownMessages.find((item) => item.match.some((part) => normalized.includes(part)));
  return found?.text || 'Nao foi possivel concluir a autenticacao. Revise os dados e tente novamente.';
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
      name: extra.fullName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
      role: role === 'admin' ? 'buyer' : role,
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/#/auth?confirmed=1`,
        data: {
          full_name: fullName,
          role: accountRole,
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
      throw new Error(data.error || 'Nao foi possivel ativar o modo vendedor.');
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
