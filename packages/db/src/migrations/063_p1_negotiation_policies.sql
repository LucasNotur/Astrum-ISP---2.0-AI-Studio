-- P1-03: negociação guiada de dívidas
-- Política por tenant (desconto à vista + parcelamento)

CREATE TABLE IF NOT EXISTS negotiation_policies (
  tenant_id           uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  max_discount_pct    integer NOT NULL DEFAULT 10 CHECK (max_discount_pct BETWEEN 0 AND 100),
  max_installments    integer NOT NULL DEFAULT 3  CHECK (max_installments >= 1),
  enabled             boolean NOT NULL DEFAULT true,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE negotiation_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY negotiation_policies_tenant ON negotiation_policies
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
