-- 021_legacy_conversation_map.sql
-- Plano Mestre V2, S70. Ponte entre o ticket legado (Firestore) e a conversation
-- nova (Supabase). No modelo legado, mensagens penduram no ticket; no alvo, penduram
-- na conversation. Cada ticket legado com mensagens vira 1 conversation + N messages.
-- Esta tabela guarda o vínculo para (a) idempotência do ETL e (b) delta-sync até o cutover.

CREATE TABLE IF NOT EXISTS legacy_ticket_conversation_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  legacy_ticket_id TEXT NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  last_synced_message_at TIMESTAMPTZ,   -- watermark do delta-sync (maior message.createdAt já migrado)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, legacy_ticket_id)  -- idempotência: 1 ticket legado → no máx. 1 conversation
);

ALTER TABLE legacy_ticket_conversation_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON legacy_ticket_conversation_map;
CREATE POLICY tenant_isolation ON legacy_ticket_conversation_map
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_legacy_conv_map_ticket
  ON legacy_ticket_conversation_map (tenant_id, legacy_ticket_id);
