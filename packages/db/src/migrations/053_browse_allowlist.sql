-- IA-22: Web browsing allowlist per tenant.

CREATE TABLE IF NOT EXISTS browse_allowlist (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  domain text NOT NULL,
  added_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, domain)
);

ALTER TABLE browse_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY browse_allowlist_tenant ON browse_allowlist
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
