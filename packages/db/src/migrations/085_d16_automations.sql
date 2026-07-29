-- =============================================================================
-- 085 — D-16: Foundry — automações por linguagem natural instaladas por tenant.
-- Desbloqueio: 5+ tenants ativos pedindo coisas diferentes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS automations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  nl_prompt        TEXT NOT NULL,             -- requisição original em linguagem natural
  generated_query  TEXT,                       -- SQL validado pelo sql-guard
  schedule         TEXT,                       -- cron expression (BullMQ repeat)
  template_name    TEXT,                       -- nome do template HSM para o envio
  output_action    TEXT NOT NULL DEFAULT 'list'
    CHECK (output_action IN ('list','send_whatsapp','create_campaign','export_csv')),
  status           TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','error')),
  last_run_at      TIMESTAMPTZ,
  last_run_result  JSONB,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_tenant ON automations (tenant_id, status, created_at DESC);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "automations_tenant" ON automations USING (tenant_id = get_tenant_id());
