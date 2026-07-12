-- =============================================================================
-- 072 — D-15: Túnel de Vento — população sintética de assinantes.
-- Cada rodada (run) executa N personas contra o agente em staging e grava
-- transcript + score + violações. Nada aqui toca canal real: só processMessage.
-- =============================================================================

CREATE TABLE IF NOT EXISTS wind_tunnel_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  personas_total  INT NOT NULL DEFAULT 0,
  personas_passed INT NOT NULL DEFAULT 0,
  avg_score       NUMERIC(3,2),            -- média do judge 1-5 (NULL se judge indisponível)
  violations_total INT NOT NULL DEFAULT 0,
  triggered_by    TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'nightly' (PLANO_E E-01)
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  error           TEXT
);

CREATE TABLE IF NOT EXISTS wind_tunnel_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES wind_tunnel_runs(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  persona_id      TEXT NOT NULL,           -- id do catálogo em personas.ts
  turns           INT NOT NULL DEFAULT 0,
  ended_by        TEXT NOT NULL,           -- 'persona_satisfied' | 'escalated' | 'max_turns'
  passed          BOOLEAN NOT NULL DEFAULT FALSE,
  score_1a5       INT,                     -- judge (NULL = judge indisponível)
  judge_rationale TEXT,
  violations      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{type, detail, turn}]
  transcript      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{role: 'persona'|'agent', content, turn}]
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wt_runs_tenant    ON wind_tunnel_runs (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_wt_results_run    ON wind_tunnel_results (run_id);
CREATE INDEX IF NOT EXISTS idx_wt_results_tenant ON wind_tunnel_results (tenant_id, persona_id);

ALTER TABLE wind_tunnel_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE wind_tunnel_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_wt_runs"    ON wind_tunnel_runs    USING (tenant_id = get_tenant_id());
CREATE POLICY "tenant_own_wt_results" ON wind_tunnel_results USING (tenant_id = get_tenant_id());
