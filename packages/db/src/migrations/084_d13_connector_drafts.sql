-- =============================================================================
-- 084 — D-13: Connector Forge — conectores ERP gerados por agente codificador.
-- Desbloqueio: 2+ pedidos de ERP fora do top-5 (sinal de demanda real).
-- =============================================================================

CREATE TABLE IF NOT EXISTS connector_drafts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erp_name      TEXT NOT NULL,
  api_spec      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- doc da API fornecida
  generated_code TEXT,
  test_results  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{test, passed, output}]
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','generating','testing','ready','failed')),
  requested_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  pr_ref        TEXT,   -- referência do artefato/PR gerado
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_drafts_status ON connector_drafts (status, created_at DESC);

ALTER TABLE connector_drafts ENABLE ROW LEVEL SECURITY;
-- Super-admin only
CREATE POLICY "connector_drafts_super_admin" ON connector_drafts USING (
  EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin')
  )
);
