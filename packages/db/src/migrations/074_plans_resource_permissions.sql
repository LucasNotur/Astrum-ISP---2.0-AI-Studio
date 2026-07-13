-- =============================================================================
-- 074 — checkup banco×código (2026-07-12): duas tabelas consultadas pelo código
-- que nunca ganharam migration.
--  · plans — fallback local do funil P3 quando o ERP não expõe planos
--    (sales-funnel.service.ts getAvailablePlans)
--  · resource_permissions — ABAC do backend legado
--    (src/lib/permissionsManager.ts via permissionMiddleware)
-- Nota: 'contracts' NÃO precisa de tabela — o escritor real (gemini.server via
-- db-compat) roteia para legacy_docs; o export createContract de db.ts é morto.
-- =============================================================================

CREATE TABLE IF NOT EXISTS plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  download_mbps INT NOT NULL DEFAULT 0,
  upload_mbps   INT NOT NULL DEFAULT 0,
  price_cents   INT NOT NULL DEFAULT 0,
  description   TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_tenant_active ON plans (tenant_id, active, price_cents);

CREATE TABLE IF NOT EXISTS resource_permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  resource    TEXT NOT NULL,
  conditions  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_perms_lookup ON resource_permissions (tenant_id, user_id, resource);

ALTER TABLE plans                ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_plans" ON plans USING (tenant_id = get_tenant_id());
CREATE POLICY "tenant_own_resource_perms" ON resource_permissions USING (tenant_id = get_tenant_id());
