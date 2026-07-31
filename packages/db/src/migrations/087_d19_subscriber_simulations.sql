-- =============================================================================
-- 087 — D-19: Gêmeo do Assinante — simulação de decisão por cliente.
-- Desbloqueio: 90d de histórico de ações/respostas no motor novo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS subscriber_simulations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
  segment_filter  JSONB,   -- filtro de segmento quando não é por cliente
  action_type     TEXT NOT NULL
    CHECK (action_type IN ('price_change','suspension','offer','upgrade','downgrade')),
  action_params   JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- price_change: {delta_cents}, offer: {discount_pct, type}, etc.
  result          JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- {churn_prob_before, churn_prob_after, delta_pct, ltv_impact_cents,
    --  recommendation, segment_size, confidence_note}
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriber_sims_tenant ON subscriber_simulations (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriber_sims_cust   ON subscriber_simulations (tenant_id, customer_id);

ALTER TABLE subscriber_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriber_sims_tenant" ON subscriber_simulations USING (tenant_id = get_tenant_id());
