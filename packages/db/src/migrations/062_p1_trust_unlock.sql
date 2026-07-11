-- P1-01: religue por confiança
-- trust_unlock_policies: política por tenant (default aplicado em código quando ausente)
-- trust_unlocks: auditoria de cada religue executado

CREATE TABLE IF NOT EXISTS trust_unlock_policies (
  tenant_id    uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  max_times_per_year  integer NOT NULL DEFAULT 2,
  max_debt_cents      integer NOT NULL DEFAULT 20000,
  enabled             boolean NOT NULL DEFAULT true,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trust_unlock_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY trust_unlock_policies_tenant ON trust_unlock_policies
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS trust_unlocks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  debt_cents_at_unlock integer NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trust_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY trust_unlocks_tenant ON trust_unlocks
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS trust_unlocks_tenant_customer_created
  ON trust_unlocks(tenant_id, customer_id, created_at);
