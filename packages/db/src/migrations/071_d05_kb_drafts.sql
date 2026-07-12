-- =============================================================================
-- 071 — D-05: Rascunhos automáticos de KB (Memória Institucional Viva)
-- Conversa resolvida → rascunho gerado por GPT-4o → curadoria humana → artigo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS kb_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  ticket_id       UUID REFERENCES tickets(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'published')),
  draft_title     TEXT NOT NULL,
  draft_body      TEXT NOT NULL,
  source_summary  TEXT,                    -- resumo da conversa fonte (para contexto no card)
  generated_by    TEXT DEFAULT 'auto',     -- 'auto' | 'manual'
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  published_article_id UUID REFERENCES knowledge_articles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_drafts_tenant  ON kb_drafts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_kb_drafts_status  ON kb_drafts (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_kb_drafts_conv    ON kb_drafts (conversation_id) WHERE conversation_id IS NOT NULL;

ALTER TABLE kb_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_kb_drafts" ON kb_drafts
  USING (tenant_id = get_tenant_id());
