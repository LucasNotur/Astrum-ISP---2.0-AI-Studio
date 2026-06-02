import { createClient } from '@supabase/supabase-js';

const getEnv = () => {
  let url = 'https://placeholder.supabase.co';
  let key = 'placeholder';

  // Tentamos pegar do Vite se estiver no contexto do browser
  if (typeof import.meta !== 'undefined' && import.meta.env) {
     url = import.meta.env.VITE_SUPABASE_URL || url;
     key = import.meta.env.VITE_SUPABASE_ANON_KEY || key;
  }

  // Tentamos pegar do process.env se dispnível (Node backend)
  if (typeof process !== 'undefined' && process.env) {
     url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.URL_SUPABASE || url;
     key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KE || key;
  }

  return { url, key };
}

let { url: supabaseUrl, key: supabaseAnonKey } = getEnv();

// O Supabase Client espera a URL base, mas as vezes o usuário cola com /rest/v1/
supabaseUrl = supabaseUrl.replace('/rest/v1/', '').replace(/\/$/, '');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false, // backend não persiste sessão
  },
});

export default supabase;
