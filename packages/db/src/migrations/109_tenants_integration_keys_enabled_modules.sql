-- =============================================================================
-- 109 — Colunas `tenants.integration_keys` e `tenants.enabled_modules` (nunca
-- migradas, código já assumia que existiam).
--
-- Achado 2026-08-24 verificando se o /trial ainda funciona: /trial/signup
-- (radarTrialEnabledModules() em tenants.enabled_modules) e o self-service de
-- chaves em Configurações → Integrações (tenants.integration_keys, usado por
-- OpenAI/Gemini/Anthropic/Evolution/SMTP/Clicksign/D4Sign BYOK por tenant —
-- ver apps/api/src/lib/tenant-keys.ts) escreviam/liam essas colunas desde que
-- foram escritas, mas nenhuma migration jamais as criou — todo INSERT/UPDATE
-- que tocava nelas falhava com "Could not find the column in the schema
-- cache". Combinado com o bug de RLS/client-anônimo corrigido no mesmo commit
-- (trial.service.ts usava o client anon, que a RLS bloqueia silenciosamente
-- antes mesmo de chegar nesse erro de schema), o /trial/signup nunca
-- funcionou de ponta a ponta em produção.
--
-- `integration_keys`: chaves de integração cifradas por tenant (SEC-R5,
-- AES-256-GCM server-side com ERP_CRED_KEY) — mesmo campo livre já referenciado
-- por integration-secrets.routes.ts e tenant-keys.ts.
-- `enabled_modules`: mapa módulo→ligado usado pelo plano radar_trial pra
-- restringir o que o tenant trial vê (ver radarTrialEnabledModules()).
--
-- Sem nova policy de RLS: são só colunas na tabela `tenants`, que já tem RLS
-- (tenant_see_own/super_admin_all_tenants) cobrindo a linha inteira.
-- =============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS integration_keys jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enabled_modules  jsonb NOT NULL DEFAULT '{}'::jsonb;
