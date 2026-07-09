-- IA-17: MCP API keys per tenant.

CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  tools text[] NOT NULL,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_tenant
  ON mcp_api_keys (tenant_id);

ALTER TABLE mcp_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY mcp_api_keys_tenant ON mcp_api_keys
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
