-- 038_safety_vetoes.sql
-- IA-21 — Constitutional classifier (nó de veto dedicado).
-- Cada resposta vetada pelo classificador de segurança vai para esta fila de
-- revisão humana. Categorias fixas (rubrica). review_status = 'pending' até o
-- humano marcar 'veto_correto' (dataset negativo p/ IA-29) ou 'falso_positivo'
-- (dataset positivo p/ IA-29).

CREATE TABLE IF NOT EXISTS safety_vetoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID,
  response_text TEXT NOT NULL,
  categories TEXT[] NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','veto_correto','falso_positivo')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety_vetoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON safety_vetoes;
CREATE POLICY tenant_isolation ON safety_vetoes
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_safety_vetoes_tenant_status_created
  ON safety_vetoes (tenant_id, review_status, created_at DESC);
