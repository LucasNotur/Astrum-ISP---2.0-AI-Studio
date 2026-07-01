-- Migration 002: Dead Letter Queue
-- Substitui o Firestore dead_letter_queue removido no Sprint 0.
-- Extraído de supabase-migrations.sql (raiz) para o diretório canônico — a README
-- já documentava este 002, mas o arquivo não existia aqui. Conteúdo preservado tal
-- como foi aplicado (RLS baseada em auth.uid()/auth.jwt()).
-- NOTA: convenção de RLS difere de 005+ (get_tenant_id()). Ver DB_CONSOLIDATION_NOTES.md.

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
