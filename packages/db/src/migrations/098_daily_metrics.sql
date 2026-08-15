-- =============================================================================
-- 098 — Tabela `daily_metrics` + `tenants.fcr_target` (Fase 1 migração).
--
-- O fcr.worker (S79, 01:00 BRT) faz upsert em `daily_metrics` (FCR + TMA/TMR por
-- dia/tenant), mas a TABELA NUNCA EXISTIU → o upsert falhava silenciosamente e os
-- cards FCR/Time-Quality liam uma fonte vazia (/api/metrics/* também dava 404).
-- Criar a tabela conserta o worker E destrava os dashboards.
--
-- `fcr_target` (meta de FCR editável na UI) vira coluna do tenant (não existia).
-- Idempotente. Aplicada via MCP + registrada.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.daily_metrics (
  id                 text PRIMARY KEY,              -- `${tenantId}_${YYYY-MM-DD}` (worker)
  tenant_id          uuid NOT NULL,
  date               date NOT NULL,
  fcr_rate           numeric NOT NULL DEFAULT 0,
  fcr_ai             numeric NOT NULL DEFAULT 0,
  fcr_human          numeric NOT NULL DEFAULT 0,
  total_tickets      integer NOT NULL DEFAULT 0,
  resolved_tickets   integer NOT NULL DEFAULT 0,
  escalated_tickets  integer NOT NULL DEFAULT 0,
  tma_total_ms       bigint  NOT NULL DEFAULT 0,
  tma_ai_ms          bigint  NOT NULL DEFAULT 0,
  tma_human_ms       bigint  NOT NULL DEFAULT 0,
  tmr_total_ms       bigint  NOT NULL DEFAULT 0,
  tmr_ai_ms          bigint  NOT NULL DEFAULT 0,
  tmr_human_ms       bigint  NOT NULL DEFAULT 0,
  calculated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_tenant_date ON public.daily_metrics(tenant_id, date);

ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_own_daily_metrics ON public.daily_metrics;
CREATE POLICY tenant_own_daily_metrics ON public.daily_metrics
  FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS super_admin_all_daily_metrics ON public.daily_metrics;
CREATE POLICY super_admin_all_daily_metrics ON public.daily_metrics
  FOR ALL USING (public.is_super_admin());

REVOKE ALL ON public.daily_metrics FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_metrics TO authenticated;

-- Meta de FCR editável (0–100). Default 80.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS fcr_target integer NOT NULL DEFAULT 80;
