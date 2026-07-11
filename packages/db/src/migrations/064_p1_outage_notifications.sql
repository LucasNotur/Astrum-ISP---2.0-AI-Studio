-- P1-02: notificações de falha em massa
-- Registro auditável de cada disparo de outage

CREATE TABLE IF NOT EXISTS outage_notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cto_id         text,
  message        text NOT NULL,
  customer_count integer NOT NULL DEFAULT 0,
  sent_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outage_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY outage_notifications_tenant ON outage_notifications
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS outage_notifications_tenant_sent
  ON outage_notifications(tenant_id, sent_at DESC);
