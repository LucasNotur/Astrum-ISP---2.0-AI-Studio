-- Índices críticos para performance multi-tenant

-- Tickets: busca por tenant + status (mais comum)
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_status
  ON tickets(tenant_id, status, created_at DESC);

-- Mensagens: busca por conversa (realtime + histórico)
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at ASC);

-- Mensagens: ETL incremental (DuckDB sync)
CREATE INDEX IF NOT EXISTS idx_messages_tenant_created
  ON messages(tenant_id, created_at ASC);

-- Faturas: CobrAI (busca por status)
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status
  ON invoices(tenant_id, status, due_date);

-- Cobrai jobs: busca por fatura (cancelamento)
CREATE INDEX IF NOT EXISTS idx_cobrai_jobs_invoice
  ON cobrai_jobs(invoice_id, status);

-- Refresh tokens: revogação por usuário
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
  ON refresh_tokens(user_id, revoked);

-- Knowledge documents: busca por tenant + status (polling de indexação)
CREATE INDEX IF NOT EXISTS idx_knowledge_tenant_status
  ON knowledge_documents(tenant_id, status);

-- Audit log: busca por tenant (compliance)
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created
  ON audit_log(tenant_id, created_at DESC);

-- Analisar tabelas após criar índices
ANALYZE tickets;
ANALYZE messages;
ANALYZE invoices;
ANALYZE cobrai_jobs;
