-- 123_whatsapp_multi_instancia.sql
-- Multi-instância WhatsApp (roadmap confirmado 2026-08-27, ver
-- .claude memory astrum-whatsapp-multi-instancia-roadmap).
--
-- tenant_evolution_instances (migration 022) já permitia múltiplas linhas por
-- tenant_id (só tinha UNIQUE(instance_name)), mas faltavam as colunas que a UI
-- (WhatsAppPage.tsx) já tentava gravar — bug pré-existente documentado em
-- whatsapp-page.routes.ts (F1-B): label/phone_number/ai_enabled nunca existiram
-- na tabela real. Adiciona também is_primary: fallback de qual instância usar
-- pra enviar quando o contexto não tem instância conhecida (ex.: disparo manual
-- do dashboard, cobrança). Backfill: nenhum tenant real tem evolution_instance
-- hoje (confirmado via query em produção), mas o INSERT cobre o caso futuro
-- sem quebrar tenants que já tenham a coluna simples preenchida.
--
-- messages ganha instance_name: tag por mensagem de qual número/serviço tratou
-- aquela troca. Decisão de produto (2026-08-27): conversa continua unificada
-- por cliente (não fragmenta em conversa-por-número); a granularidade de "qual
-- serviço foi acionado" fica na mensagem, pra métrica de uso por serviço e
-- para dado de treino/aprendizado da IA no futuro.

ALTER TABLE tenant_evolution_instances
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- No máximo 1 instância primária por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_evo_primary
  ON tenant_evolution_instances (tenant_id)
  WHERE is_primary;

-- Backfill: tenant com evolution_instance (coluna simples, S71) legado vira a
-- instância primária na tabela multi-instância, sem duplicar.
INSERT INTO tenant_evolution_instances (tenant_id, instance_name, is_primary, ai_enabled)
SELECT id, evolution_instance, true, true
FROM tenants
WHERE evolution_instance IS NOT NULL
ON CONFLICT (instance_name) DO NOTHING;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS instance_name TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_instance_name
  ON messages (tenant_id, instance_name)
  WHERE instance_name IS NOT NULL;
