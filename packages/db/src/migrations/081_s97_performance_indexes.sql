-- S97 Performance Hardening — índices compostos para as queries mais críticas.
-- Portal do assinante, CobrAI batch, crisis detector e dashboard.

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id_customer_id_status
  ON invoices (tenant_id, customer_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id_due_date_status
  ON invoices (tenant_id, due_date, status);

CREATE INDEX IF NOT EXISTS idx_service_orders_tenant_id_customer_id_status
  ON service_orders (tenant_id, customer_id, status);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id_cpf
  ON customers (tenant_id, cpf);

CREATE INDEX IF NOT EXISTS idx_tickets_tenant_id_status_created_at
  ON tickets (tenant_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id_customer_id_created_at
  ON conversations (tenant_id, customer_id, created_at);
