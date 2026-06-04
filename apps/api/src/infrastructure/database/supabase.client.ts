import { createClient } from '@supabase/supabase-js';

// Único ponto de acesso ao Supabase — nunca importe supabase diretamente de outro lugar

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.URL_SUPABASE || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KE || 'placeholder';

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export const SUPABASE_URL = supabaseUrl;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'placeholder_service_role_key';

if (supabaseServiceRoleKey === 'placeholder_service_role_key') {
  console.warn('⚠️ AVISO: SUPABASE_SERVICE_ROLE_KEY não configurado! Realtime e operations que requerem Admin falharão.');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

export default supabaseClient;
