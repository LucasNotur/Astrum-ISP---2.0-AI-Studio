-- 039_campaign_variants.sql
-- IA-26 — Multi-armed bandit (Thompson sampling) para variantes de campanha CobrAI.
-- Tabela de variantes por (tenant, campaign) + registro de envios para cálculo de recompensa.
-- Recompensa (alpha/beta increment) é feita por job diário (campaign-reward.worker) — não incluso nesta migration.
--
-- Pior caso do RLS 023 (padrão usado em 038_feature_store.sql): política USING + WITH CHECK
-- baseadas em current_setting('app.current_tenant_id', true)::uuid. O supabaseAdmin (service_role)
-- bypassa RLS — workers e jobs administrativos operam sem política.

CREATE TABLE IF NOT EXISTS campaign_variants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_key TEXT NOT NULL,
  variant_key  TEXT NOT NULL,
  template     TEXT NOT NULL,
  alpha        INTEGER NOT NULL DEFAULT 1,
  beta         INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  UNIQUE (tenant_id, campaign_key, variant_key)
);

CREATE TABLE IF NOT EXISTS variant_sends (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  variant_id   UUID NOT NULL REFERENCES campaign_variants(id),
  invoice_id   UUID NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome      TEXT CHECK (outcome IN ('paid','expired')),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_variant_sends_unresolved
  ON variant_sends (tenant_id, outcome) WHERE outcome IS NULL;

ALTER TABLE campaign_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON campaign_variants;
CREATE POLICY tenant_isolation ON campaign_variants
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_insert ON campaign_variants;
CREATE POLICY tenant_insert ON campaign_variants
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_update ON campaign_variants;
CREATE POLICY tenant_update ON campaign_variants
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE variant_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON variant_sends;
CREATE POLICY tenant_isolation ON variant_sends
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_insert ON variant_sends;
CREATE POLICY tenant_insert ON variant_sends
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_update ON variant_sends;
CREATE POLICY tenant_update ON variant_sends
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
