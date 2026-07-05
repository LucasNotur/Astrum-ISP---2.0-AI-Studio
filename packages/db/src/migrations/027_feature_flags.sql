-- 027_feature_flags.sql
-- Plano Mestre V2, S89. Overrides de feature flags por tenant (beta/rollout gradual).
-- O tier do plano define o baseline; a tabela guarda apenas exceções por tenant.

CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flag TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, flag)
);

ALTER TABLE tenant_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON tenant_feature_flags;
CREATE POLICY tenant_isolation ON tenant_feature_flags
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
