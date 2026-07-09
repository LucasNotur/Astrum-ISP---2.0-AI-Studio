-- IA-12: Voice biometry consents + voice prints (port-ready).

CREATE TABLE IF NOT EXISTS voice_biometry_consents (
  customer_id uuid PRIMARY KEY REFERENCES customers(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  consented_at timestamptz NOT NULL DEFAULT now(),
  consent_channel text NOT NULL DEFAULT 'voice',
  revoked_at timestamptz
);

ALTER TABLE voice_biometry_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY voice_biometry_consents_tenant ON voice_biometry_consents
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS voice_prints (
  customer_id uuid PRIMARY KEY REFERENCES customers(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  print bytea,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE voice_prints ENABLE ROW LEVEL SECURITY;

CREATE POLICY voice_prints_tenant ON voice_prints
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
