import { supabase } from '../lib/supabase.js';

/**
 * Cadastrar novo usuário (Sign Up)
 */
export async function signUpUser(email, password, fullName, role = 'buyer') {
  try {
    const accountRole = role === 'seller' ? 'seller' : 'buyer';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: accountRole
        }
      }
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error("Sign up error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Fazer login (Sign In)
 */
export async function signInUser(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error("Sign in error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Fazer logout (Sign Out)
 */
export async function signOutUser() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error("Sign out error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Pegar sessão atual
 */
export async function getCurrentSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  return session;
}

/**
 * Obter dados do perfil do usuário logado
 */
export async function getCurrentProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
    
  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }
  return data;
}

/**
 * Escutar mudanças de autenticação
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}
