-- IA-39: Constitutional loop — princípios editáveis por tenant.

CREATE TABLE IF NOT EXISTS tenant_constitutions (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  principles text[] NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_constitutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_constitutions_tenant ON tenant_constitutions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
