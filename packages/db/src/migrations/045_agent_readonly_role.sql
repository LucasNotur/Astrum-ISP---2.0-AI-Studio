-- 038_agent_readonly_role.sql
-- IA-44 — Sandbox SQL do agente (somente leitura, defesa dupla).
--
-- Cria o role Postgres `agent_readonly` e três views que filtram colunas
-- sensíveis (LGPD: nome, email, telefone, CPF fora das views de cliente).
-- A aplicação conecta-se com `SANDBOX_DB_URL` usando esse role; o
-- `statement_timeout` de 3s e o `default_transaction_read_only = on` no
-- role impedem queries longas e mutações, respectivamente. Defesa em
-- profundidade: o sql-guard.ts também bloqueia via AST, e o LIMIT 500 +
-- WHERE tenant_id = $1 são injetados no app.

-- ── 1. Role (idempotente) ──────────────────────────────────────────────
-- ⚠️ Em projetos Supabase, `CREATE ROLE` via migration SQL pode ser
-- bloqueado pelo painel (o Supabase gerencia roles via Dashboard).
-- Se a role já existir, este DO block é no-op. Se o Supabase recusar
-- a criação, crie manualmente em: Supabase → SQL Editor → execute o
-- comando CREATE ROLE abaixo e reaplique esta migration para garantir
-- as views/grants.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agent_readonly') THEN
    CREATE ROLE agent_readonly NOLOGIN;
  END IF;
END $$;

-- ── 2. Views denaturadas (LGPD) ────────────────────────────────────────
-- `customers` real tem: name, email, phone, cpf — NUNCA expor.
-- Mantemos apenas id, tenant_id, plan, status, created_at (sem PII).
CREATE OR REPLACE VIEW vw_agent_customers AS
  SELECT id, tenant_id, plan_id AS plan, status, created_at
  FROM customers;

-- `invoices` real: id, tenant_id, customer_id, plan_id, amount_cents,
-- status, due_date, paid_at, payment_method, external_id, created_at.
-- Mantemos o conjunto suficiente para a régua CobrAI/IA olhar histórico
-- financeiro sem expor payment_method (gateway-specific) nem external_id.
CREATE OR REPLACE VIEW vw_agent_invoices AS
  SELECT id, tenant_id, customer_id, amount_cents, status, due_date, paid_at
  FROM invoices;

-- `tickets` real: id, tenant_id, customer_id, title, description,
-- status, priority, assigned_to, resolved_by_ai, created_at, updated_at.
-- Mantemos id, tenant_id, customer_id, priority, status, created_at.
-- (title/description são PII/redação livre — não devem vazar para o agente.)
CREATE OR REPLACE VIEW vw_agent_tickets AS
  SELECT id, tenant_id, customer_id, priority, status, created_at
  FROM tickets;

-- ── 3. Grants ─────────────────────────────────────────────────────────
GRANT SELECT ON vw_agent_customers, vw_agent_invoices, vw_agent_tickets
  TO agent_readonly;

-- ── 4. Defesa em profundidade no role ──────────────────────────────────
-- Timeout de 3s impede queries runaway; default_transaction_read_only
-- torna qualquer escrita impossível mesmo se o guard falhar.
ALTER ROLE agent_readonly SET statement_timeout = '3s';
ALTER ROLE agent_readonly SET default_transaction_read_only = on;

-- ── 5. Auditoria de queries executadas no sandbox ─────────────────────
CREATE TABLE IF NOT EXISTS sandbox_queries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  user_id     UUID NOT NULL,
  sql_text    TEXT NOT NULL,
  rows        INTEGER,
  ms          INTEGER,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_queries_tenant_time
  ON sandbox_queries (tenant_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sandbox_queries_user_time
  ON sandbox_queries (user_id, executed_at DESC);

ALTER TABLE sandbox_queries ENABLE ROW LEVEL SECURITY;

-- RLS 023-style: tenant isolation usando current_setting() (mesmo
-- padrão de 023_shadow_results.sql).
DROP POLICY IF EXISTS tenant_isolation ON sandbox_queries;
CREATE POLICY tenant_isolation ON sandbox_queries
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
