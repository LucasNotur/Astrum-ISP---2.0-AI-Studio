-- IA-24: Network anomaly detection results.

CREATE TABLE IF NOT EXISTS network_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  cto_id text,
  metric text NOT NULL,
  value numeric NOT NULL,
  expected numeric NOT NULL,
  zscore numeric NOT NULL,
  severity text NOT NULL CHECK (severity IN ('medio', 'alto')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_network_anomalies_tenant
  ON network_anomalies (tenant_id, created_at DESC);

ALTER TABLE network_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY network_anomalies_tenant ON network_anomalies
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
