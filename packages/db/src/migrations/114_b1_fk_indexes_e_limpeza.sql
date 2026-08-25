-- =============================================================================
-- 114 — B1 (PLANO-100): índices em FKs das tabelas quentes + remoção dos
--       3 índices duplicados apontados pelos advisors.
--
-- Idempotente (CREATE INDEX IF NOT EXISTS / DROP INDEX IF EXISTS). Pode ser reaplicada.
-- Sem CONCURRENTLY de propósito: o runner (packages/db/src/migrate.ts) roda cada
-- migration numa transação e o volume atual das tabelas é baixo.
--
-- CONTEXTO — advisors de performance re-rodados em 2026-08-25 via MCP:
--   • unindexed_foreign_keys: 59 (o plano registrou 57 em 2026-08-24; 2 novas desde então)
--   • duplicate_index: 3
--   • unused_index: 134  → NÃO tocados (decisão do plano, passo 4): sem tráfego real
--     o dado de uso não é confiável. Revisão futura pós-VPS.
--
-- ESCOPO (passo 2 do plano): só FKs das tabelas quentes do produto —
--   invoices, conversations, tickets, customers, service_orders, audit_log,
--   filas/outbox (outbox, cobrai_jobs, dead_letter_queue).
--   `messages`, `audit_log` e `dead_letter_queue` não têm nenhuma FK sem índice hoje.
--   As 49 FKs restantes são de tabelas frias e ficam para depois — lista completa
--   no relatório da tarefa B1 em .astrum-progress/PLANO_ACAO_100_OPERACIONAL.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Índices de FK — tabelas quentes
--    Coluna da FK como PRIMEIRA coluna do índice (é o que cobre o join e o
--    DELETE em cascata do lado pai). Índices compostos existentes que começam
--    por tenant_id (ex.: idx_customers_cto = (tenant_id, cto_id)) NÃO cobrem.
-- -----------------------------------------------------------------------------

-- invoices.plan_id → billing_plans(id)
CREATE INDEX IF NOT EXISTS idx_invoices_plan_id ON public.invoices (plan_id);

-- conversations.customer_id → customers(id) / conversations.assigned_to → users(id)
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON public.conversations (customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON public.conversations (assigned_to);

-- tickets.customer_id → customers(id) / tickets.assigned_to → users(id)
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON public.tickets (customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets (assigned_to);

-- customers.cto_id → network_ctos(id)
CREATE INDEX IF NOT EXISTS idx_customers_cto_id ON public.customers (cto_id);

-- service_orders.cto_id → network_ctos(id) / service_orders.premise_id → customer_premises(id)
CREATE INDEX IF NOT EXISTS idx_service_orders_cto_id ON public.service_orders (cto_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_premise_id ON public.service_orders (premise_id);

-- outbox.tenant_id → tenants(id)  (fila: outbox pattern, migration 013)
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_id ON public.outbox (tenant_id);

-- cobrai_jobs.rule_id → cobrai_rules(id)  (fila da cobrança CobrAI)
CREATE INDEX IF NOT EXISTS idx_cobrai_jobs_rule_id ON public.cobrai_jobs (rule_id);

-- -----------------------------------------------------------------------------
-- 2) Índices duplicados (advisor duplicate_index)
--    Os 3 pares são byte-a-byte idênticos, não-únicos e não sustentam nenhuma
--    constraint (verificado em pg_index/pg_constraint antes do drop).
--    Mantido sempre o nome mais descritivo.
-- -----------------------------------------------------------------------------

-- audit_log (tenant_id, created_at DESC): mantém idx_audit_tenant_created
DROP INDEX IF EXISTS public.idx_audit_tenant;

-- knowledge_documents (tenant_id, status): mantém idx_knowledge_tenant_status
DROP INDEX IF EXISTS public.idx_docs_status;

-- tenant_meta_pages (tenant_id): mantém idx_tenant_meta_pages_tenant
DROP INDEX IF EXISTS public.tenant_meta_pages_tenant;
