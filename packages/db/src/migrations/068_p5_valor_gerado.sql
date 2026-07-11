-- 068_p5_valor_gerado.sql
-- P5: Dashboard de Valor Gerado + Case Engine + Trial + Status Incidents
-- Data: 2026-07-11

-- ── P5-04: Cases auditados compartilháveis ────────────────────────────────────
CREATE TABLE IF NOT EXISTS valor_cases (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period        TEXT        NOT NULL,
  period_days   INT         NOT NULL,
  recovered_cents BIGINT    NOT NULL DEFAULT 0,
  ai_resolved   INT         NOT NULL DEFAULT 0,
  hours_saved   NUMERIC(10,2) NOT NULL DEFAULT 0,
  tickets_avoided INT       NOT NULL DEFAULT 0,
  ai_cost_usd   NUMERIC(10,4) NOT NULL DEFAULT 0,
  roi_multiple  NUMERIC(10,2) NOT NULL DEFAULT 0,
  share_token   TEXT        UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_valor_cases_tenant ON valor_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_valor_cases_token ON valor_cases(share_token) WHERE share_token IS NOT NULL;

ALTER TABLE valor_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant isolation" ON valor_cases;
CREATE POLICY "tenant isolation" ON valor_cases
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::uuid);

-- ── P5-05: Trial sem fricção ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trial_tenants (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email                    TEXT        NOT NULL,
  erp_provider             TEXT,
  erp_connected            BOOLEAN     NOT NULL DEFAULT FALSE,
  first_insight_generated  BOOLEAN     NOT NULL DEFAULT FALSE,
  signup_ip                TEXT,
  expires_at               TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_tenants_tenant ON trial_tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trial_tenants_email ON trial_tenants(email);

-- ── P5-02: Incidentes da status page ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS status_incidents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  component   TEXT        NOT NULL CHECK (component IN ('api','whatsapp','ia','cobranca','portal')),
  severity    TEXT        NOT NULL CHECK (severity IN ('minor','major','critical')),
  status      TEXT        NOT NULL CHECK (status IN ('investigating','identified','monitoring','resolved'))
                          DEFAULT 'investigating',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_incidents_status ON status_incidents(status);
