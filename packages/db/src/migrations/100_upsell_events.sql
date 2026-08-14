-- =============================================================================
-- 100 — Tabela `upsell_events` (Fase 1 migração Express→Fastify; backlog 🟡).
--
-- Antes: o front (App.tsx) registrava upsell em `/api/upsell/convert` (404) e o
-- DashboardPage lia de `cobrai_jobs` (tabela da engine de COBRANÇA, semântica
-- errada p/ upsell manual). Store próprio p/ os eventos de upsell do operador,
-- consultável pelo dashboard, com RLS por tenant no padrão do projeto.
--
-- `outcome`: 'offered' | 'converted' | 'rejected'.
-- Idempotente. Aplicada via MCP + registrada em schema_migrations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.upsell_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  customer_id     uuid,
  current_plan    text,
  suggested_plan  text,
  outcome         text NOT NULL DEFAULT 'offered',
  operator_id     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upsell_events_tenant ON public.upsell_events(tenant_id, created_at DESC);

ALTER TABLE public.upsell_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upsell_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_own_upsell_events ON public.upsell_events;
CREATE POLICY tenant_own_upsell_events ON public.upsell_events
  FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS super_admin_all_upsell_events ON public.upsell_events;
CREATE POLICY super_admin_all_upsell_events ON public.upsell_events
  FOR ALL USING (public.is_super_admin());

REVOKE ALL ON public.upsell_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.upsell_events TO authenticated;
