-- =============================================================================
-- 086 — D-17: Marketplace de playbooks com prova via backtesting D-02.
-- Desbloqueio: ≥10 tenants + D-02 rodando com dados reais.
-- ISPs não competem entre si (geografia) → compartilham livremente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS playbooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'cobranca'
    CHECK (category IN ('cobranca','atendimento','vendas','campo')),
  policy        JSONB NOT NULL,           -- política serializada (CobrancaPolicy ou similar)
  metrics       JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- {recovery_rate_improvement, sample_size, avg_uplift_pct, confidence_interval}
  published_by  UUID REFERENCES tenants(id) ON DELETE SET NULL,
  is_public     BOOLEAN NOT NULL DEFAULT true,
  downloads     INT NOT NULL DEFAULT 0,
  published_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS playbook_installs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id     UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  backtest_result JSONB,   -- resultado do D-02 no histórico do comprador antes de ativar
  activated       BOOLEAN NOT NULL DEFAULT false,
  installed_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (playbook_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_playbooks_category   ON playbooks (category, downloads DESC);
CREATE INDEX IF NOT EXISTS idx_playbook_installs_t  ON playbook_installs (tenant_id, installed_at DESC);

ALTER TABLE playbooks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_installs  ENABLE ROW LEVEL SECURITY;

-- Playbooks públicos são visíveis a todos os tenants autenticados
CREATE POLICY "playbooks_read_public" ON playbooks FOR SELECT USING (is_public = true);
CREATE POLICY "playbooks_own" ON playbooks USING (published_by = get_tenant_id());
CREATE POLICY "playbook_installs_tenant" ON playbook_installs USING (tenant_id = get_tenant_id());
