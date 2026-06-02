-- Migration 001: Idempotency Keys
-- Garante que operações financeiras não sejam executadas duas vezes

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key UUID NOT NULL UNIQUE,
  tenant_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_key ON idempotency_keys (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys (expires_at);

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON idempotency_keys
  USING (tenant_id = auth.uid());

-- Migration 002: Dead Letter Queue
-- Substitui o Firestore dead_letter_queue removido no Sprint 0

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  job_name TEXT NOT NULL,
  queue_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  tenant_id UUID,
  failed_at TIMESTAMPTZ DEFAULT NOW(),
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_dlq_tenant ON dead_letter_queue (tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlq_resolved ON dead_letter_queue (resolved, failed_at);
CREATE INDEX IF NOT EXISTS idx_dlq_job_name ON dead_letter_queue (job_name);

ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all" ON dead_letter_queue
  FOR ALL USING (auth.jwt() ->> 'role' = 'super_admin');

CREATE POLICY "tenant_own_jobs" ON dead_letter_queue
  FOR SELECT USING (tenant_id = auth.uid());

-- Migration 003: Realtime setup CDC
-- Habilitar Realtime (CDC) nas tabelas principais
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE cobrai_jobs;

-- Trigger para criar regras CobrAI padrão em novos tenants
CREATE OR REPLACE FUNCTION create_default_cobrai_rules()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO cobrai_rules (tenant_id, name, days_overdue, action, message_template, active)
  VALUES
    (NEW.id, 'Lembrete D+1', 1, 'send_message',
     'Olá {{customerName}}! Sua fatura de R$ {{amountBRL}} venceu. Regularize: {{paymentLink}}', true),
    (NEW.id, 'Aviso D+5', 5, 'send_message',
     'Atenção {{customerName}}, 5 dias em aberto. Pague para evitar suspensão: {{paymentLink}}', true),
    (NEW.id, 'Suspensão D+10', 10, 'suspend_signal', NULL, true),
    (NEW.id, 'Notificar Operador D+30', 30, 'notify_human',
     'Cliente {{customerName}} com {{daysOverdue}} dias inadimplente.', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_tenant_created ON tenants;

CREATE TRIGGER after_tenant_created
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION create_default_cobrai_rules();

COMMENT ON TRIGGER after_tenant_created ON tenants IS
  'Cria regras CobrAI padrão automaticamente ao cadastrar novo tenant.';
