-- =============================================================================
-- 041_ai_costs_dimensions.sql
-- IA-34 — Atribuição de custo de IA por cliente e feature (cost drill-down).
--
-- Acrescenta três dimensões em ai_performance_logs para que o painel
-- /ai-costs consiga drill-down por:
--   - customer_id      (quem consumiu o token)
--   - conversation_id  (qual conversa/contexto)
--   - use_case         (qual feature: agent_response, classify-intent,
--                       network-diagnostic, ticket-report, chat-stream, …)
--
-- Estas colunas são preenchidas por apps/api/src/infrastructure/observability/
-- cost-recorder.ts a partir de IA-34 em diante. Registros anteriores ficam
-- com NULL — é o comportamento esperado: "Os custos passam a ser atribuídos
-- por cliente a partir da ativação desta versão — os dados antigos não são
-- reprocessados."
--
-- Não tocamos em nenhuma coluna já existente (migration 018 + 028) — só
-- ADD COLUMN IF NOT EXISTS e dois índices compostos. RLS da tabela original
-- (tenant_own_aiperf) permanece valendo: customer_id/conversation_id/use_case
-- são derivados, o tenant_id é a chave de isolamento canônica.
-- =============================================================================

ALTER TABLE ai_performance_logs
  ADD COLUMN IF NOT EXISTS customer_id     UUID,
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS use_case        TEXT;

CREATE INDEX IF NOT EXISTS idx_aiperf_customer
  ON ai_performance_logs (tenant_id, customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_aiperf_usecase
  ON ai_performance_logs (tenant_id, use_case, created_at);
