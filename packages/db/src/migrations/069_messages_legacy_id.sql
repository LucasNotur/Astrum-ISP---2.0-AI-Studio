-- 069_messages_legacy_id.sql
-- Plano Mestre V2, S70. Adiciona legacy_id à tabela messages para idempotência
-- do ETL conversacional: cada mensagem migrada do Firestore recebe o ID original,
-- evitando duplicatas em reexecuções e no delta-sync.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS legacy_id TEXT;

-- Unicidade por conversation (não global): o mesmo ID legado pode existir em tenants diferentes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_conv_legacy
  ON messages (conversation_id, legacy_id) WHERE legacy_id IS NOT NULL;
