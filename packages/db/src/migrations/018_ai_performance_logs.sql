-- =============================================================================
-- 018 — Logs de Performance da IA / SLA (migração Firestore audit_logs → Supabase)
-- ⚠️ ATENÇÃO: o `audit_logs` legado NÃO é a tabela `audit_log` (segurança).
--    São propósitos opostos — ver DB_MIGRATION_GAP_REPORT.md §1.6.
--    O legado é métrica de performance da IA e SLA; por isso vai para uma
--    tabela NOVA e dedicada.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  legacy_id TEXT,
  ticket_id UUID REFERENCES tickets(id),
  category TEXT,
  sentiment TEXT,
  response_time_ms INTEGER,             -- legado: responseTime
  sla_compliant BOOLEAN,                -- legado: slaCompliant
  is_critical BOOLEAN DEFAULT FALSE,    -- legado: isCritical
  created_at TIMESTAMPTZ DEFAULT NOW(),  -- legado: timestamp
  UNIQUE (tenant_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_aiperf_tenant ON ai_performance_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_aiperf_ticket ON ai_performance_logs (ticket_id);
CREATE INDEX IF NOT EXISTS idx_aiperf_sla ON ai_performance_logs (tenant_id, sla_compliant);

ALTER TABLE ai_performance_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_aiperf" ON ai_performance_logs USING (tenant_id = get_tenant_id());
