import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Faltam variáveis de ambiente do Supabase (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY). Verifique seu arquivo .env.");
}

export const supabase = createClient(
  supabaseUrl || 'https://mock-url.supabase.co', 
  supabaseAnonKey || 'mock-key'
);
