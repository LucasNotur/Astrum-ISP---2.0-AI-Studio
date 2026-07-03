import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase server-side (SERVICE_ROLE — permissões totais, NUNCA expor no frontend).
 * Inicialização lazy via Proxy: importar este módulo nunca lança; só o primeiro USO
 * exige as envs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. (Mesmo padrão do antigo
 * firebaseAdmin.ts — permite que testes mockem o módulo sem env configurada.)
 */

let client: SupabaseClient | null = null;

function ensureClient(): SupabaseClient {
  if (client) return client;

  let supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.URL_SUPABASE;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      '[supabaseAdmin] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para operações server-side.'
    );
  }

  supabaseUrl = supabaseUrl.replace('/rest/v1/', '').replace(/\/$/, '');

  client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return client;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const c = ensureClient();
    const value = (c as any)[prop];
    return typeof value === 'function' ? value.bind(c) : value;
  },
});
