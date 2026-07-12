-- =============================================================================
-- 069 — D-06 Copiloto de Campo: histórico de diagnósticos visuais
-- Cada foto tirada pelo técnico em campo gera um registro auditável com o
-- diagnóstico de visão estruturada (IA-04 classifyFieldPhoto via GPT-4o).
-- =============================================================================

CREATE TABLE IF NOT EXISTS field_photo_diagnoses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_order_id UUID REFERENCES service_orders(id) ON DELETE SET NULL,
  cto_id          UUID REFERENCES network_ctos(id) ON DELETE SET NULL,
  technician_id   UUID REFERENCES technicians(id) ON DELETE SET NULL,
  photo_url       TEXT NOT NULL,
  equipment       TEXT NOT NULL
    CHECK (equipment IN ('cto','roteador','onu','cabo_fibra','poste','outro')),
  issue           TEXT NOT NULL
    CHECK (issue IN ('fibra_rompida','led_vermelho','conector_sujo','sem_problema_visivel',
                     'queimado','agua_umidade','outro')),
  severity        TEXT NOT NULL
    CHECK (severity IN ('baixa','media','alta','critica')),
  recommended_action TEXT NOT NULL,
  confidence      NUMERIC(3,2) NOT NULL,
  low_confidence  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fpd_tenant      ON field_photo_diagnoses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fpd_so          ON field_photo_diagnoses (service_order_id);
CREATE INDEX IF NOT EXISTS idx_fpd_cto         ON field_photo_diagnoses (cto_id);
CREATE INDEX IF NOT EXISTS idx_fpd_severity    ON field_photo_diagnoses (tenant_id, severity, created_at DESC);

ALTER TABLE field_photo_diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_fpd" ON field_photo_diagnoses
  USING (tenant_id = get_tenant_id());
