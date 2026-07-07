-- 040_context_savings.sql
-- IA-30 — Compressão determinística de contexto RAG.
-- Adiciona coluna em ai_performance_logs para acumular tokens economizados pela
-- dedup + truncation (consumido pelo StatCard da AICostsPage — IA-30).
-- Idempotente.

ALTER TABLE ai_performance_logs
  ADD COLUMN IF NOT EXISTS context_tokens_saved INTEGER DEFAULT 0;
