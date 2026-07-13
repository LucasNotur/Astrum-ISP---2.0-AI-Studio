-- =============================================================================
-- 077 — E-01 (Cérebro Noturno) + D-04 F1 (NOC autônomo) — 2026-07-13.
-- Desbloqueados com combustível sintético (seed-demo-tenant): codar agora,
-- calibrar com dados reais depois.
-- =============================================================================

-- E-01: o diário imutável do que a Astrum "pensou" a cada noite.
CREATE TABLE IF NOT EXISTS ai_reflections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reflection_date DATE NOT NULL,
  metrics         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- números crus do dia
  hypotheses      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{code, severity, text, evidence}]
  actions         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{type, detail}] — sugeridas (E-03 executa)
  generated_by    TEXT NOT NULL DEFAULT 'rules',       -- 'rules' | 'rules+llm'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, reflection_date)
);

-- D-04: incidentes de rede com máquina de estados
-- suspeita → confirmada → comunicada → normalizada (cancelada de qualquer estado).
CREATE TABLE IF NOT EXISTS incidents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cto_id             UUID REFERENCES network_ctos(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'suspeita'
    CHECK (status IN ('suspeita', 'confirmada', 'comunicada', 'normalizada', 'cancelada')),
  severity           TEXT NOT NULL DEFAULT 'medio' CHECK (severity IN ('medio', 'alto')),
  title              TEXT NOT NULL,
  source             TEXT NOT NULL DEFAULT 'anomaly' CHECK (source IN ('anomaly', 'crisis', 'manual')),
  affected_customers INT NOT NULL DEFAULT 0,
  detected_at        TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at       TIMESTAMPTZ,
  communicated_at    TIMESTAMPTZ,
  normalized_at      TIMESTAMPTZ,
  extra              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_reflections_tenant ON ai_reflections (tenant_id, reflection_date DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_tenant   ON incidents (tenant_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_open     ON incidents (tenant_id, cto_id)
  WHERE status IN ('suspeita', 'confirmada', 'comunicada');

ALTER TABLE ai_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents      ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_reflections" ON ai_reflections USING (tenant_id = get_tenant_id());
CREATE POLICY "tenant_own_incidents"   ON incidents      USING (tenant_id = get_tenant_id());
