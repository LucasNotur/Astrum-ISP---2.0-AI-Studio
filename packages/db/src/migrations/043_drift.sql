-- =============================================================================
-- 040_drift.sql
-- IA-33 — Detecção de drift do agente (Population Stability Index).
--
-- Duas tabelas:
--   ai_intent_daily: contagem por (tenant, day, intent, sentiment) — escrita
--                    fire-and-forget pelo nó nodeClassify quando a flag
--                    DRIFT_DETECTION_ENABLED=true. Serve de insumo para o
--                    worker calcular PSI por tenant.
--   drift_reports:   histórico dos PSIs calculados (intents / sentimentos)
--                    para o painel /intelligence/drift.
--
-- ⚠️ ARMADILHA: ai_intent_daily.sentiment é NULLABLE. PRIMARY KEY com
-- COALESCE é inválido em Postgres. Solução: UNIQUE INDEX de expressão.
-- O upsert em classify.node.ts usa onConflict exatamente com as 4 colunas
-- (Postgres trata o índice de expressão como alvo de conflito).
--
-- RLS: padrão 023_shadow_results.sql — política tenant_isolation baseada em
-- current_setting('app.current_tenant_id', true)::uuid. O supabaseAdmin
-- (service_role) bypassa RLS — workers e jobs administrativos operam sem
-- política.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_intent_daily (
  tenant_id UUID   NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day       DATE   NOT NULL,
  intent    TEXT   NOT NULL,
  sentiment TEXT,                                  -- nullable: NUNCA na PK
  count     INTEGER NOT NULL DEFAULT 0
);

-- COALESCE(sentiment, '') transforma NULL em sentinela vazia para o índice
-- funcionar; o upsert envia o mesmo valor via onConflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_intent_daily_uniq
  ON ai_intent_daily (tenant_id, day, intent, COALESCE(sentiment, ''));

CREATE INDEX IF NOT EXISTS idx_intent_daily_tenant_day
  ON ai_intent_daily (tenant_id, day DESC);

ALTER TABLE ai_intent_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON ai_intent_daily;
CREATE POLICY tenant_isolation ON ai_intent_daily
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_insert ON ai_intent_daily;
CREATE POLICY tenant_insert ON ai_intent_daily
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_update ON ai_intent_daily;
CREATE POLICY tenant_update ON ai_intent_daily
  FOR UPDATE USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS drift_reports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric     TEXT NOT NULL,                        -- 'intent' | 'sentiment'
  psi        NUMERIC NOT NULL,
  severity   TEXT NOT NULL CHECK (severity IN ('ok','medio','alto')),
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drift_reports_tenant_created
  ON drift_reports (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_drift_reports_tenant_metric_created
  ON drift_reports (tenant_id, metric, created_at DESC);

ALTER TABLE drift_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON drift_reports;
CREATE POLICY tenant_isolation ON drift_reports
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_insert ON drift_reports;
CREATE POLICY tenant_insert ON drift_reports
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
