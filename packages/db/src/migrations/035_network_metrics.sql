-- 035_network_metrics.sql
-- IA-09 — Coleta de métricas de rede (CTO failure prediction, fase 0).
-- Tabela de séries temporais para telemetria de CTOs.

CREATE TABLE IF NOT EXISTS network_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cto_id UUID NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('latency_ms', 'packet_loss_pct', 'signal_dbm', 'clients_online')),
  value NUMERIC NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_network_metrics_tenant_cto
  ON network_metrics (tenant_id, cto_id, metric, collected_at DESC);

-- RLS padrão por tenant_id
ALTER TABLE network_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON network_metrics;
CREATE POLICY tenant_isolation ON network_metrics
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_insert ON network_metrics;
CREATE POLICY tenant_insert ON network_metrics
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
