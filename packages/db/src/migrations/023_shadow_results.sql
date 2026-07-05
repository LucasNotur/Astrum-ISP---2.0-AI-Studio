-- 023_shadow_results.sql
-- Plano Mestre V2, S74. Registra o que o motor NOVO TERIA respondido enquanto roda em
-- shadow mode (sem enviar de verdade), para comparar com o legado antes do cutover.

CREATE TABLE IF NOT EXISTS shadow_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID,
  message_id TEXT,
  user_message TEXT,
  v2_response TEXT,              -- o que o motor novo geraria
  legacy_response TEXT,          -- o que o legado enviou (se pareado)
  latency_ms INTEGER,
  tokens_used INTEGER,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shadow_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON shadow_results;
CREATE POLICY tenant_isolation ON shadow_results
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_shadow_results_tenant ON shadow_results (tenant_id, created_at DESC);
