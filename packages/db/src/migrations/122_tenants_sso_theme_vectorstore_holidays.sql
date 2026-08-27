-- 122_tenants_sso_theme_vectorstore_holidays.sql
-- Decisão do Lucas (2026-08-27): SSO, tema (whitelabel), vector store BYOK e
-- feriados viram colunas reais em `tenants` — cada tela já assumia essas colunas
-- desde que foi escrita (achado da F1-C, PLANO_ACAO_100_OPERACIONAL.md), mas
-- nenhuma migration jamais as criou.
--
-- Mantidas como colunas próprias (não sub-chave de `tenants.settings`) pra seguir
-- o mesmo padrão já usado em `integration_keys`/`enabled_modules`/`escalation_rules`
-- — e porque `holidays.routes.ts` (rota já existente, `POST
-- /api/v2/settings/holidays/fetch-national`) já lê/grava `tenants.holidays` como
-- coluna de topo, não aninhada.
--
-- `knowledge_articles.vector_indexed` incluída aqui por ser a mesma feature
-- (contagem de artigos indexados, lida na mesma função que carrega
-- vector_store_config em SettingsPage.tsx/AIConfigPage.tsx).
--
-- `embedding_config` incluída também: mesmo par load/save que `vector_store_config`
-- em KnowledgeBasePage.tsx (`loadConfigs`/`saveConfigs`), conceito irmão (qual
-- provider/modelo de embedding vs. qual vector DB) — mesmo gap de schema, mesma
-- correção, faz sentido fechar junto.
--
-- Aditiva e não-destrutiva.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS sso_config         jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS theme              jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vector_store_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS embedding_config   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS holidays           jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.knowledge_articles
  ADD COLUMN IF NOT EXISTS vector_indexed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenants.sso_config IS
  '{ domain: string } — domínio Google Workspace pra SSO (SettingsPage.tsx, aba SSO).';
COMMENT ON COLUMN public.tenants.theme IS
  '{ primary_color, secondary_color, font_family, logo_url, login_background_url } — whitelabel (SettingsPage.tsx, aba Tema).';
COMMENT ON COLUMN public.tenants.vector_store_config IS
  '{ provider, url, apiKey, collection } — BYOK do banco vetorial (Qdrant/etc) por tenant.';
COMMENT ON COLUMN public.knowledge_articles.vector_indexed IS
  'TRUE quando o documento já foi indexado no vector store — usado só pra exibir contagem hoje (não bloqueia RAG).';
