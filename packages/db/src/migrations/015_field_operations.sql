-- =============================================================================
-- 015 — Operações de Campo (migração Firestore → Supabase)
-- Entidades legadas: network_ctos, technicians, service_orders
-- Coluna legacy_id preserva o doc.id do Firestore para o ETL (idempotência + remap de FK).
-- =============================================================================

-- Caixas de terminação óptica (CTO) — infraestrutura de rede
CREATE TABLE IF NOT EXISTS network_ctos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  legacy_id TEXT,                       -- doc.id original no Firestore
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  total_ports INTEGER NOT NULL,
  used_ports INTEGER NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'full', 'maintenance')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_ctos_tenant ON network_ctos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ctos_status ON network_ctos (tenant_id, status);

ALTER TABLE network_ctos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_ctos" ON network_ctos USING (tenant_id = get_tenant_id());

-- Técnicos de campo
CREATE TABLE IF NOT EXISTS technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  legacy_id TEXT,
  user_id UUID REFERENCES users(id),    -- opcional: link ao login, se o técnico acessar o sistema
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'offline'
    CHECK (status IN ('available', 'break', 'offline')),
  current_task TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_tech_tenant ON technicians (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tech_status ON technicians (tenant_id, status);

ALTER TABLE technicians ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_tech" ON technicians USING (tenant_id = get_tenant_id());

-- Ordens de serviço (OS) geradas pela IA ou operador
CREATE TABLE IF NOT EXISTS service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  legacy_id TEXT,
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT,                   -- desnormalizado (legado); preencher via join no ETL
  address TEXT,
  latitude DOUBLE PRECISION,            -- legado: lat
  longitude DOUBLE PRECISION,           -- legado: lng
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'em_deslocamento', 'em_atendimento', 'concluido', 'cancelado')),
  type TEXT NOT NULL,
  description TEXT,
  cto_id UUID REFERENCES network_ctos(id),  -- legado: campo texto `cto`; resolver p/ FK no ETL
  cto_legacy TEXT,                      -- valor bruto de `cto` caso não resolva p/ FK
  port INTEGER,
  materials TEXT[] DEFAULT '{}',
  assigned_to UUID REFERENCES technicians(id),  -- legado: assignedTo
  ai_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_so_tenant ON service_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_so_status ON service_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_so_customer ON service_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_so_assigned ON service_orders (assigned_to);

ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_so" ON service_orders USING (tenant_id = get_tenant_id());
