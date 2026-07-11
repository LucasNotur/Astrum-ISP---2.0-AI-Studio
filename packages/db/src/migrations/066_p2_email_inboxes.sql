-- P2-02: mapeamento inbox de e-mail → tenant
-- Cada provedor pode ter um ou mais endereços de entrada

CREATE TABLE IF NOT EXISTS tenant_email_inboxes (
  email        text PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_email_inboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_email_inboxes_tenant ON tenant_email_inboxes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS tenant_email_inboxes_tenant ON tenant_email_inboxes(tenant_id);
