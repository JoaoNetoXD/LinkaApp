import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  const message = 'Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';
  if (import.meta.env.PROD) {
    throw new Error(message);
  }
  console.warn(`${message} Using local development placeholders.`);
}

// E-mail links (confirmation, password reset) return to "#/auth?...", and Supabase adds
// "#access_token=..." after it. supabase-js reads the tokens only from the start of the
// hash, so they move to the front before it looks; main.js reopens the saved route.
export const AUTH_RETURN_KEY = 'empreende_auth_return';
if (typeof window !== 'undefined') {
  const callback = window.location.hash.match(/^#(\/[^#]*)#(.*)$/);
  if (callback && /(^|&)(access_token|error_description|error)=/.test(callback[2])) {
    sessionStorage.setItem(AUTH_RETURN_KEY, `#${callback[1]}`);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${callback[2]}`);
  }
}

export const supabase = createClient(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'dev-placeholder-key'
);
