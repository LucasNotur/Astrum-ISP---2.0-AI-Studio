-- =============================================================================
-- 019 — Reconciliação de tabelas existentes com o modelo legado (Firestore)
-- Adiciona campos que existiam no Firestore e faltavam no alvo, + legacy_id
-- para o ETL. NÃO faz conversão de dados — isso é responsabilidade do ETL
-- (ver DB_MIGRATION_GAP_REPORT.md §1). Idempotente.
-- =============================================================================

-- ---------- customers ----------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS mrr_cents INTEGER;          -- legado: mrr (reais) → *100 no ETL
ALTER TABLE customers ADD COLUMN IF NOT EXISTS retention_discount_used_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS legacy_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_legacy
  ON customers (tenant_id, legacy_id) WHERE legacy_id IS NOT NULL;
-- Nota: status legado (active/inactive/pending) é normalizado no ETL para o
-- enum alvo (active/suspended/cancelled): inactive→suspended, pending→active.

-- ---------- tickets ----------
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT TRUE;   -- legado: aiEnabled
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ai_attempts INTEGER DEFAULT 0;     -- legado: aiAttempts
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS legacy_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_legacy
  ON tickets (tenant_id, legacy_id) WHERE legacy_id IS NOT NULL;
-- Amplia o enum de status para incluir 'escalated' (estado real usado no fluxo).
-- priority 'urgent' (legado) é mapeado para 'critical' no ETL.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'escalated'));

-- ---------- invoices ----------
-- Dados CRÍTICOS que a IA usa para cobrar (2ª via / Pix) e faltavam no alvo.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_url TEXT;      -- legado: paymentUrl
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pix_copy_paste TEXT;   -- legado: pixCopyPaste
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS legacy_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_legacy
  ON invoices (tenant_id, legacy_id) WHERE legacy_id IS NOT NULL;
-- Nota: amount legado (reais) → amount_cents (*100) no ETL.

-- ---------- ai_configurations ----------
-- Absorve o modelo AIProviderConfig (provider/model + fallback).
ALTER TABLE ai_configurations ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE ai_configurations ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE ai_configurations ADD COLUMN IF NOT EXISTS fallback_provider TEXT;
ALTER TABLE ai_configurations ADD COLUMN IF NOT EXISTS fallback_model TEXT;
