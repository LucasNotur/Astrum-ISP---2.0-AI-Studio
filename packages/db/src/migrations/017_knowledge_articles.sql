-- =============================================================================
-- 017 — Artigos de Conhecimento (migração Firestore knowledge_base → Supabase)
-- Preserva o TEXTO ORIGINAL do artigo (que no legado ficava inline no banco).
-- Distinto de `knowledge_documents` (arquivos + Qdrant): um artigo pode ser
-- re-ingerido no pipeline RAG, gerando um knowledge_documents vinculado.
-- =============================================================================

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  legacy_id TEXT,                       -- doc.id original no Firestore
  title TEXT NOT NULL,
  content TEXT NOT NULL,                -- texto do artigo (fonte editável)
  tags TEXT[] DEFAULT '{}',
  category TEXT,
  -- Rastreamento da re-ingestão no RAG (Qdrant):
  ingest_status TEXT DEFAULT 'pending'
    CHECK (ingest_status IN ('pending', 'indexed', 'failed')),
  document_id UUID REFERENCES knowledge_documents(id),  -- doc gerado pela re-ingestão
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_kb_articles_tenant ON knowledge_articles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_kb_articles_ingest ON knowledge_articles (tenant_id, ingest_status);
CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON knowledge_articles (tenant_id, category);

ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_kb_articles" ON knowledge_articles USING (tenant_id = get_tenant_id());
