-- IA-36: Edge inference shadow results (no PII — only hash).

CREATE TABLE IF NOT EXISTS edge_shadow_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  message_hash text NOT NULL,
  central_intent text NOT NULL,
  edge_intent text,
  agree boolean,
  edge_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edge_shadow_tenant
  ON edge_shadow_results (tenant_id, created_at DESC);

ALTER TABLE edge_shadow_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY edge_shadow_tenant ON edge_shadow_results
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
