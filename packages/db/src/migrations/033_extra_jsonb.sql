-- 033_extra_jsonb.sql — Plano FIRESTORE-ZERO (FZ-1).
-- O Firestore era schemaless: o código legado grava campos arbitrários nos documentos.
-- A coluna `extra` recebe qualquer campo sem coluna nativa correspondente (o db-compat
-- move a chave para cá automaticamente ao receber PGRST204 e funde de volta na leitura).
-- Meta de longo prazo: promover campos frequentes de `extra` para colunas reais.

ALTER TABLE customers          ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE tickets            ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE messages           ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE tenants            ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE invoices           ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE service_orders     ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE technicians        ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE inventory          ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE team_members       ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE notifications      ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE network_ctos       ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE knowledge_articles ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE users              ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE ai_performance_logs ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';
ALTER TABLE dead_letter_queue  ADD COLUMN IF NOT EXISTS extra JSONB NOT NULL DEFAULT '{}';

-- Operadores por tenant (array JSONB): routingEngine (backend, via db-compat
-- tenantColumn) e App.tsx (frontend, via upsertTenantOperator) usam o mesmo storage.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS operators JSONB NOT NULL DEFAULT '[]';

-- Regras de escalonamento por tenant (array JSONB): EscalationRulesBuilder (frontend)
-- e escalationEngine/messageWorker (backend, via db-compat) usam o mesmo storage.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS escalation_rules JSONB NOT NULL DEFAULT '[]';
