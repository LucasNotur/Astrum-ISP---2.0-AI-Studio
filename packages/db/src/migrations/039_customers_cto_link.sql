-- 039_customers_cto_link.sql
-- IA-16 — GraphRAG leve: vincula cada cliente à sua CTO.
-- Sem este link, o agente não consegue responder "se a CTO X cair, quem é afetado?".
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS cto_id UUID REFERENCES network_ctos(id);

CREATE INDEX IF NOT EXISTS idx_customers_cto ON customers (tenant_id, cto_id);
