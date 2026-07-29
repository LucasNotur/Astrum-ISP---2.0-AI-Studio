-- =============================================================================
-- 088 — D-21: Onboarding de ISP em 1 dia — orquestrador de self-service IA.
-- Desbloqueio: 2+ onboardings reais para calibrar o roteiro.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_onboarding_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed')),
  erp_connector  TEXT,   -- qual ERP está conectado (IXC, Voalle, MK, SGP, Hubsoft)
  steps          JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- [{step, label, status, started_at, completed_at, result}]
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  error          TEXT,
  summary        JSONB   -- relatório final (customers_imported, graph_nodes, kb_articles, etc.)
);

CREATE INDEX IF NOT EXISTS idx_ai_onboarding_tenant ON ai_onboarding_jobs (tenant_id, started_at DESC);

ALTER TABLE ai_onboarding_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_onboarding_jobs_tenant" ON ai_onboarding_jobs USING (tenant_id = get_tenant_id());
