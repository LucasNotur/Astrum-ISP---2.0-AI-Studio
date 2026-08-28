-- =============================================================================
-- 097 — Svix: guardar o id da mensagem Svix em webhook_deliveries (reentrega manual).
--
-- ✅ APLICADA 2026-08-28 via MCP (aprovada pelo Lucas). Idempotente (IF NOT EXISTS).
--
-- PROBLEMA: a tela de Webhooks (src/pages/WebhooksPage.tsx → retryDelivery) reenvia uma
-- entrega falha via POST /api/v2/webhooks/deliveries/:id/retry. Para reenviar de fato pela
-- API do Svix (messageAttempt.resend) é preciso o id da MENSAGEM no Svix — mas o audit log
-- `webhook_deliveries` (migration 014) só guardava tenant/evento/payload/status, nunca o
-- ponteiro para a mensagem Svix. Sem ele, não há o que reenviar.
--
-- SOLUÇÃO: coluna `svix_message_id`. O svixService passa a gravá-la no `send()` (id devolvido
-- por svix.message.create). A rota de retry lê a entrega ESCOPADA por tenant, pega esse id e
-- pede o reenvio ao Svix. Entregas antigas (coluna NULL) não são reenviáveis → 409 honesto.
-- =============================================================================

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS svix_message_id TEXT;
