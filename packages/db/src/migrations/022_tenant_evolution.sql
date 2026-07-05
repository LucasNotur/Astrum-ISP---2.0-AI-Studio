-- 022_tenant_evolution.sql
-- Plano Mestre V2, S71. Mapeia instância(s) da Evolution API a tenants no Supabase,
-- para o webhook novo (apps/api) descobrir o tenant pela instância — hoje isso vive
-- no Firestore (campos evolutionInstance / evolution_instances).

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS evolution_instance TEXT;

-- Multi-instância (um tenant pode ter várias conexões WhatsApp).
CREATE TABLE IF NOT EXISTS tenant_evolution_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',   -- open | close | connecting | unknown
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instance_name)                     -- uma instância pertence a no máx. 1 tenant (segurança)
);

ALTER TABLE tenant_evolution_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON tenant_evolution_instances;
CREATE POLICY tenant_isolation ON tenant_evolution_instances
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_tenant_evo_instance ON tenant_evolution_instances (instance_name);
CREATE INDEX IF NOT EXISTS idx_tenants_evo_instance ON tenants (evolution_instance);
