-- 028_ai_costs.sql — S102: rastreamento de custo de IA por conversa/dia/tenant
-- Adiciona campos de token e custo em ai_performance_logs.
-- Budget hard-stop configurável por tenant.

ALTER TABLE ai_performance_logs
  ADD COLUMN IF NOT EXISTS tokens_in        INTEGER,
  ADD COLUMN IF NOT EXISTS tokens_out       INTEGER,
  ADD COLUMN IF NOT EXISTS model            TEXT,
  ADD COLUMN IF NOT EXISTS cost_usd         NUMERIC(10,6);

-- Budget mensal e hard-stop por tenant
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ai_budget_usd_monthly  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS ai_budget_hard_stop     BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_aiperf_cost ON ai_performance_logs (tenant_id, created_at, cost_usd);
