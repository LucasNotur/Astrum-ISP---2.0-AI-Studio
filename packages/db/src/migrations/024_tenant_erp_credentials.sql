-- 024_tenant_erp_credentials.sql
-- Plano Mestre V2, S75. Credenciais de ERP por tenant, CIFRADAS em repouso.
-- O campo credentials_encrypted guarda o payload AES-256-GCM (nunca texto puro).

CREATE TABLE IF NOT EXISTS tenant_erp_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                 -- ixc | mkauth | sgp | voalle | hubsoft | radiusnet | rbx
  credentials_encrypted TEXT NOT NULL,    -- AES-256-GCM: iv:authTag:ciphertext (base64)
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

ALTER TABLE tenant_erp_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON tenant_erp_credentials;
CREATE POLICY tenant_isolation ON tenant_erp_credentials
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_erp_creds_tenant ON tenant_erp_credentials (tenant_id, provider);
