-- =============================================================================
-- 083 — D-10: ISP-BR fine-tune — pipeline de fine-tuning sobre labeled_examples.
-- Construído com dados sintéticos; calibrar elasticidades quando ≥5k exemplos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS fine_tune_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = cross-tenant (super_admin)
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','exporting','training','evaluating','succeeded','failed','cancelled')),
  provider         TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai','anthropic')),
  base_model       TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  fine_tuned_model TEXT,          -- model id após treino (ex: ft:gpt-4o-mini:...)
  training_file_id TEXT,          -- file id na plataforma do provider
  job_id           TEXT,          -- job id na plataforma do provider
  training_count   INT,           -- nº de exemplos usados
  eval_score_before NUMERIC(5,3), -- baseline antes do treino (avg_score 0–1)
  eval_score_after  NUMERIC(5,3), -- após treino (D-10: só promove se melhorar)
  promoted         BOOLEAN NOT NULL DEFAULT false,
  error            TEXT,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fine_tune_runs_status ON fine_tune_runs (status, started_at DESC);

ALTER TABLE fine_tune_runs ENABLE ROW LEVEL SECURITY;
-- Somente super_admin vê todos; tenant vê o próprio
CREATE POLICY "fine_tune_runs_tenant" ON fine_tune_runs
  USING (tenant_id IS NULL OR tenant_id = get_tenant_id());
