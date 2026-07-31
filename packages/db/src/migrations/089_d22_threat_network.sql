-- =============================================================================
-- 089 — D-22: Rede de Alerta Precoce — imunidade coletiva entre tenants.
-- Desbloqueio: ≥10 tenants + análise LGPD (mesmo gate do D-09).
-- Privacidade diferencial: originating_tenant_id não exposto no broadcast.
-- =============================================================================

CREATE TABLE IF NOT EXISTS threat_signals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  originating_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signal_type           TEXT NOT NULL
    CHECK (signal_type IN ('fraud','firmware_defect','phishing','billing_scam','security','spam')),
  description           TEXT NOT NULL,
  evidence              JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- anonimizado: {pattern_hash, affected_count_range, first_seen, indicators}
  severity              TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low','medium','high','critical')),
  broadcast_at          TIMESTAMPTZ DEFAULT NOW(),
  immunized_count       INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tenant_immunizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id     UUID NOT NULL REFERENCES threat_signals(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  immunized_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (signal_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_threat_signals_type ON threat_signals (signal_type, broadcast_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_immunizations ON tenant_immunizations (tenant_id, immunized_at DESC);

ALTER TABLE threat_signals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_immunizations  ENABLE ROW LEVEL SECURITY;

-- Qualquer tenant vê sinais (mas não sabe de quem veio — privacidade diferencial)
CREATE POLICY "threat_signals_read" ON threat_signals FOR SELECT USING (true);
CREATE POLICY "threat_signals_own"  ON threat_signals
  USING (originating_tenant_id = get_tenant_id());
CREATE POLICY "tenant_immunizations_read" ON tenant_immunizations
  USING (tenant_id = get_tenant_id());
