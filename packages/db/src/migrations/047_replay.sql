-- 040_replay.sql
-- IA-46 — Replay engine de conversas (Plano Mestre V2, S74/S82).
-- Permite reexecutar pares (mensagem user → resposta assistant) da tabela `messages`
-- contra o motor atual em modo dry-run (zero envio de WhatsApp, tools de escrita
-- neutralizadas) e medir a equivalência com a resposta original via LLM-as-judge.
--
-- Cutover S74/S82 — gate: pass_rate ≥ 95% antes de virar ATENDIMENTO_ENGINE=v2.

CREATE TABLE IF NOT EXISTS replay_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  params       JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','done','failed')),
  total        INTEGER,
  equivalent   INTEGER,
  pass_rate    NUMERIC,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS replay_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL REFERENCES replay_runs(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL,
  conversation_id     UUID,
  user_message        TEXT NOT NULL,
  original_response   TEXT NOT NULL,
  candidate_response  TEXT,
  verdict             TEXT CHECK (verdict IN ('equivalente','divergente','erro')),
  judge_rationale     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS 023 (mesma política tenant_isolation das outras tabelas sensíveis) ──
ALTER TABLE replay_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON replay_runs;
CREATE POLICY tenant_isolation ON replay_runs
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE replay_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON replay_items;
CREATE POLICY tenant_isolation ON replay_items
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- ── Índices para os GETs do painel (ordem por data + filtro por run) ──
CREATE INDEX IF NOT EXISTS idx_replay_runs_tenant ON replay_runs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replay_items_run ON replay_items (run_id);
CREATE INDEX IF NOT EXISTS idx_replay_items_tenant ON replay_items (tenant_id, created_at DESC);
