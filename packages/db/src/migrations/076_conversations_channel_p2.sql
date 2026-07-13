-- =============================================================================
-- 076 — Bug P2 pego pelo seed sintético (2026-07-13): o CHECK de
-- conversations.channel nunca foi ampliado quando o P2 (omnichannel) entrou.
-- Instagram/Messenger/e-mail/telefonia quebrariam no INSERT em produção.
-- Alinha com ConversationChannel (apps/api/src/domain/ports/conversation.port.ts).
-- =============================================================================

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN (
    'whatsapp', 'webchat', 'facebook',            -- originais
    'instagram', 'messenger', 'email', 'telephony' -- P2 + voz (IA-08)
  ));
