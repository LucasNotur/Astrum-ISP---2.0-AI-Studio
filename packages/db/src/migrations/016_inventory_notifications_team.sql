-- =============================================================================
-- 016 — Inventário, Notificações e Equipe (migração Firestore → Supabase)
-- Entidades legadas: inventory, notifications, team_members
-- =============================================================================

-- Estoque de equipamentos do ISP
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  legacy_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER DEFAULT 0,          -- legado: minStock
  unit TEXT,
  price_cents INTEGER,                  -- legado: price (reais) → converter *100 no ETL
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_tenant ON inventory (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_category ON inventory (tenant_id, category);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_inventory" ON inventory USING (tenant_id = get_tenant_id());

-- Notificações / alertas para a equipe (SLA, escalação, erros)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  legacy_id TEXT,
  type TEXT NOT NULL
    CHECK (type IN ('SLA_BREACH', 'CRITICAL_ESCALATION', 'SYSTEM_ERROR')),
  message TEXT NOT NULL,
  ticket_id UUID REFERENCES tickets(id),
  read_at TIMESTAMPTZ,                  -- controle de leitura (novo)
  created_at TIMESTAMPTZ DEFAULT NOW(),  -- legado: timestamp
  UNIQUE (tenant_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_tenant ON notifications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications (tenant_id, read_at);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_notifications" ON notifications USING (tenant_id = get_tenant_id());

-- Membros da equipe (staff do ISP) — tabela própria, separada de `users` (auth).
-- Papéis de negócio mais ricos que os papéis de acesso (RBAC) da tabela users.
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  legacy_id TEXT,
  user_id UUID REFERENCES users(id),    -- opcional: link ao login, se o membro acessar o sistema
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL
    CHECK (role IN ('admin', 'owner', 'support', 'billing', 'sales', 'atendente')),
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_team_tenant ON team_members (tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_role ON team_members (tenant_id, role);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_team" ON team_members USING (tenant_id = get_tenant_id());
