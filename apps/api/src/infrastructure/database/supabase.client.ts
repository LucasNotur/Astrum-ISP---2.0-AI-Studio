import { createClient } from '@supabase/supabase-js';

// Único ponto de acesso ao Supabase — nunca importe supabase diretamente de outro lugar

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.URL_SUPABASE || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KE || 'placeholder';

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
export const supabase = supabaseClient;

export const SUPABASE_URL = supabaseUrl;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || 'placeholder_service_role_key';

if (supabaseServiceRoleKey === 'placeholder_service_role_key') {
  console.warn('⚠️ AVISO: SUPABASE_SERVICE_ROLE_KEY não configurado! Realtime e operations que requerem Admin falharão.');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

/**
 * MT-02 (auditoria 2026-08-10) — FUNDAÇÃO da defesa em profundidade por RLS.
 *
 * Cria um client Supabase ESCOPADO ao usuário da requisição: o access token do
 * usuário vai no header `Authorization`, então a **RLS do Postgres volta a valer**
 * — mesmo que uma query esqueça o `.eq('tenant_id')`, a RLS barra cross-tenant.
 * (O `supabaseAdmin` usa service_role e BYPASSA a RLS — é onde nasce o risco MT-02.)
 *
 * ⚠️ PRÉ-REQUISITO — por isso NÃO está ligado nas rotas ainda (seria pior que nada):
 * a RLS espera um JWT do **Supabase Auth** (`sub` = id do usuário, `role` = 'authenticated').
 * O apps/api hoje emite JWT PRÓPRIO (`jwt.service.ts`: `userId`/`role:'admin'...`,
 * `aud:'astrum-operator'`). Com esse token, `auth.uid()` seria NULL → `get_tenant_id()`
 * vazio → a RLS **negaria todas as leituras**. Adotar este client exige antes UMA
 * destas decisões de arquitetura de auth (fora do escopo autônomo):
 *   (a) apps/api emitir tokens compatíveis com Supabase Auth (secret + claims corretos);
 *   (b) operadores autenticarem via Supabase Auth diretamente;
 *   (c) alternativa sem JWT: conexão `pg` por-request com `SET LOCAL` de tenant + RLS
 *       lendo `current_setting(...)` (troca a camada de acesso inteira).
 * Enquanto a decisão não é tomada, esta factory é a fundação pronta e testada.
 */
export function createUserScopedClient(accessToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default supabaseClient;
