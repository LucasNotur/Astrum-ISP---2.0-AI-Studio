-- =============================================================================
-- 102 — Tabela `tenant_meta_pages` (Fase 2, TAREFA 2 — webhook Meta Graph API).
--
-- Mapeia página do Instagram/Messenger -> tenant + token de acesso da página,
-- para `apps/api/src/adapters/meta/meta-webhook.routes.ts` resolver o tenant
-- por `page_id` (o legado fazia isso via `tenants.integrations.facebook.page_id`
-- no Firestore — aqui vira tabela relacional própria, no padrão do projeto).
--
-- Idempotente. Aplicada via MCP + registrada em schema_migrations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_meta_pages (
  page_id            text PRIMARY KEY,
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id),
  page_type          text NOT NULL CHECK (page_type IN ('instagram', 'messenger')),
  page_access_token  text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_meta_pages_tenant ON public.tenant_meta_pages(tenant_id);

ALTER TABLE public.tenant_meta_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_meta_pages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_own_tenant_meta_pages ON public.tenant_meta_pages;
CREATE POLICY tenant_own_tenant_meta_pages ON public.tenant_meta_pages
  FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS super_admin_all_tenant_meta_pages ON public.tenant_meta_pages;
CREATE POLICY super_admin_all_tenant_meta_pages ON public.tenant_meta_pages
  FOR ALL USING (public.is_super_admin());

-- anon nunca acessa (P0-B); authenticated acessa sob RLS. O webhook em si usa
-- supabaseAdmin (service role, bypassa RLS) porque quem chama é o Meta, não um
-- usuário logado — a resolução por page_id precisa enxergar todos os tenants.
REVOKE ALL ON public.tenant_meta_pages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_meta_pages TO authenticated;
