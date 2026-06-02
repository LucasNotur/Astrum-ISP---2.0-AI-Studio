-- Base de conhecimento RAG por tenant
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt', 'md')),
  file_size_bytes INTEGER,
  status TEXT DEFAULT 'processing'
    CHECK (status IN ('processing', 'indexed', 'failed')),
  chunks_count INTEGER DEFAULT 0,
  r2_key TEXT,                     -- chave no Cloudflare R2
  qdrant_collection TEXT,          -- nome da coleção no Qdrant
  error_message TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_tenant ON knowledge_documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_docs_status ON knowledge_documents (tenant_id, status);

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_docs" ON knowledge_documents USING (tenant_id = get_tenant_id());

-- Configurações de IA por tenant (personalidade, limites, etc.)
CREATE TABLE IF NOT EXISTS ai_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) UNIQUE,
  bot_name TEXT DEFAULT 'Astro',
  personality TEXT DEFAULT 'profissional e prestativo',
  language TEXT DEFAULT 'pt-BR',
  max_tokens_per_message INTEGER DEFAULT 1000,
  temperature FLOAT DEFAULT 0.7,
  security_threshold FLOAT DEFAULT 0.7,  -- threshold do injection deflector
  auto_suspend_enabled BOOLEAN DEFAULT TRUE,
  cobrai_enabled BOOLEAN DEFAULT TRUE,
  rag_enabled BOOLEAN DEFAULT TRUE,
  custom_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_configurations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_ai_config" ON ai_configurations USING (tenant_id = get_tenant_id());
