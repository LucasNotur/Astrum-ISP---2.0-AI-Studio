-- Referência do app Svix por tenant
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS svix_app_id TEXT;

-- Audit log de entregas de webhooks
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  endpoint_url TEXT
);

CREATE INDEX idx_webhook_deliveries_tenant
  ON webhook_deliveries(tenant_id, sent_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_tenant ON webhook_deliveries
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
