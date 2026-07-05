-- 036_churn_scores.sql
-- IA-07 — Churn prediction (fase 1: heuristic baseline).
-- Score 0-100 por cliente, recalculado toda noite pelo worker.
-- Fase 2 (XGBoost) usa esta mesma tabela com model_version='ml-v1'.

CREATE TABLE IF NOT EXISTS churn_scores (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  risk_band TEXT NOT NULL CHECK (risk_band IN ('low', 'medium', 'high', 'critical')),
  features JSONB NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'heuristic-v1',
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, customer_id, scored_at)
);

CREATE INDEX IF NOT EXISTS idx_churn_scores_tenant_band
  ON churn_scores (tenant_id, risk_band, scored_at DESC);

CREATE INDEX IF NOT EXISTS idx_churn_scores_customer_latest
  ON churn_scores (tenant_id, customer_id, scored_at DESC);

-- RLS padrão por tenant_id
ALTER TABLE churn_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON churn_scores;
CREATE POLICY tenant_isolation ON churn_scores
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_insert ON churn_scores;
CREATE POLICY tenant_insert ON churn_scores
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
