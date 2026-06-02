-- Tabela Outbox Pattern
CREATE TABLE IF NOT EXISTS outbox (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  CONSTRAINT max_retries CHECK (retry_count <= 5)
);

CREATE INDEX idx_outbox_pending ON outbox(created_at)
  WHERE processed_at IS NULL AND retry_count < 5;

-- Adicionar coluna file_key nos documentos (referência ao R2)
ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS file_key TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes INTEGER;

-- Configurar filas prioritárias no BullMQ via configuração
-- (registrado no startup do servidor)
COMMENT ON TABLE outbox IS 'Outbox Pattern: garante consistência entre banco e BullMQ';
