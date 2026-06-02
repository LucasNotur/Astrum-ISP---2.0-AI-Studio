import { createClient } from '@supabase/supabase-js';

let supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.URL_SUPABASE;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY é obrigatório para operações admin.');
}

supabaseUrl = supabaseUrl.replace('/rest/v1/', '').replace(/\/$/, '');

// Cliente com permissões totais — NUNCA expor no frontend
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
