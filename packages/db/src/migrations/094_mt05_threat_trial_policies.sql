-- =============================================================================
-- 094 — MT-05: fechar duas RLS policies permissivas (auditoria 2026-08-10).
--
-- ⚠️ NÃO APLICADA — staged localmente. Diferente da 092/093 (aplicadas via MCP),
-- esta fica para revisão + aplicação manual pelo runner (`npm run db:migrate`)
-- quando o dono aprovar. Toda a migration é IDEMPOTENTE.
--
-- Contexto: ambas as policies foram escritas para um client com GRANTs de tabela
-- (pré-P0-B). Depois do P0-B (REVOKE ALL FROM anon), o risco remanescente é o role
-- `authenticated` (usuário logado de QUALQUER tenant). Nenhum frontend lê estas
-- tabelas direto (só o serviço apps/api, hoje sem tráfego real) — logo os fixes
-- abaixo não quebram nada em uso; apenas fecham exposição cross-tenant latente.
-- =============================================================================

-- ── MT-05.a: threat_signals — vazamento de originating_tenant_id ──────────────
-- A migration 089 documenta o design: "Privacidade diferencial: originating_tenant_id
-- NÃO exposto no broadcast". Mas `threat_signals_read USING (true)` deixava qualquer
-- authenticated ler TODAS as linhas — inclusive `originating_tenant_id` (revela QUEM
-- foi atacado) via query direta PostgREST, contradizendo o próprio design. O serviço
-- (threat-network.service.ts) já não seleciona a coluna e anonimiza `evidence` no write;
-- a RLS é a rede de segurança que faltava fechar.
--
-- Fix: remove o read irrestrito. Sobra `threat_signals_own` (FOR ALL, próprio tenant)
-- + leitura total só para super_admin (a equipe da Astrum, como o design prevê).
-- O compartilhamento cross-tenant do feed (imunidade coletiva) é feito pelo backend
-- (service_role, que anonimiza + popula tenant_immunizations) — não por leitura direta
-- do cliente. Quando o feature `THREAT_NETWORK_ENABLED` for ligado (gate: ≥10 tenants +
-- LGPD), o painel do tenant deve ler um FEED SANITIZADO (view sem originating_tenant_id
-- ou endpoint de backend), nunca a tabela base cross-tenant.
DROP POLICY IF EXISTS "threat_signals_read" ON threat_signals;

DROP POLICY IF EXISTS "threat_signals_super_admin_read" ON threat_signals;
CREATE POLICY "threat_signals_super_admin_read" ON threat_signals
  FOR SELECT USING (public.is_super_admin());

-- ── MT-05.b: trial_tenants — INSERT irrestrito ───────────────────────────────
-- `trial_tenants_insert WITH CHECK (true)` deixava qualquer authenticated criar
-- trial_tenants (spam de trials / poluição de dados). O read já era super_admin-only
-- (assimétrico). O signup self-service (P5-05, trial.service.ts) precisa de service_role
-- para inserir (anon foi revogado no P0-B; o default client é anon e falharia no grant),
-- e service_role BYPASSA RLS — então endurecer o INSERT não quebra o signup.
--
-- Fix: só super_admin insere via RLS (criação manual de trial). O fluxo de signup
-- automatizado continua pelo backend com service_role.
DROP POLICY IF EXISTS "trial_tenants_insert" ON trial_tenants;
DROP POLICY IF EXISTS "trial_tenants_insert_super_admin" ON trial_tenants;
CREATE POLICY "trial_tenants_insert_super_admin" ON trial_tenants
  FOR INSERT WITH CHECK (public.is_super_admin());
