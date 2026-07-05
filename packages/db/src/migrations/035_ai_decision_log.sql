-- 035_ai_decision_log.sql
-- IA-06 — Audit trail imutável de decisões de IA (hash-chain por tenant).
-- LGPD/ANATEL: toda passada do grafo gera um registro append-only.
-- UPDATE/DELETE bloqueados via RULE.

CREATE TABLE IF NOT EXISTS ai_decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID,
  customer_id UUID,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('agent_response', 'escalation', 'tool_call', 'block')),
  payload JSONB NOT NULL,
  prompt_version TEXT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_decision_log_tenant_created
  ON ai_decision_log (tenant_id, created_at DESC);

-- Imutabilidade: UPDATE e DELETE são bloqueados
CREATE OR REPLACE RULE ai_decision_log_no_update AS ON UPDATE TO ai_decision_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE ai_decision_log_no_delete AS ON DELETE TO ai_decision_log DO INSTEAD NOTHING;

-- RLS por tenant_id (padrão do projeto)
ALTER TABLE ai_decision_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON ai_decision_log;
CREATE POLICY tenant_isolation ON ai_decision_log
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- SELECT permitido ao tenant dono, INSERT permitido via service_role
-- (RLS da policy acima cobre SELECT; INSERT é feito com supabaseAdmin, bypass RLS)
DROP POLICY IF EXISTS tenant_insert ON ai_decision_log;
CREATE POLICY tenant_insert ON ai_decision_log
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
