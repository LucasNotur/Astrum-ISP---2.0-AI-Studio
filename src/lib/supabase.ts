import { createClient } from '@supabase/supabase-js';

const getEnv = () => {
  let url = 'https://placeholder.supabase.co';
  let key = 'placeholder';

  // Acesso direto (não aliasado) — o Vite substitui `import.meta.env.X` de forma
  // estática só quando o padrão aparece literal no código-fonte. Guardar
  // `import.meta` numa variável antes de ler `.env` quebra essa substituição
  // e o client sempre caía no fallback 'placeholder.supabase.co'.
  url = import.meta.env.VITE_SUPABASE_URL || url;
  key = import.meta.env.VITE_SUPABASE_ANON_KEY || key;

  // Tentamos pegar do process.env se disponível (Node backend)
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
