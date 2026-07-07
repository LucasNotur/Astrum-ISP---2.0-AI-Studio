-- 038_feature_store.sql
-- IA-27 — Feature Store leve.
-- Tabela genérica de features pré-computadas por entidade (hoje: customer).
-- Alimenta modelos preditivos (churn, etc.) sem precisar recalcular em cada request.
-- Recalculada toda noite pelo worker feature-store.worker.ts (02:00 BRT, flag FEATURE_STORE_ENABLED).

CREATE TABLE IF NOT EXISTS feature_values (
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  feature      TEXT NOT NULL,
  value_numeric NUMERIC,
  value_text   TEXT,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, entity_type, entity_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_feature_values_lookup
  ON feature_values (tenant_id, feature, computed_at DESC);

ALTER TABLE feature_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON feature_values;
CREATE POLICY tenant_isolation ON feature_values
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_insert ON feature_values;
CREATE POLICY tenant_insert ON feature_values
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
