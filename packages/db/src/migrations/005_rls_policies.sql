-- ═══════════════════════════════════════════════════
-- RLS POLICIES — Isolamento absoluto entre tenants
-- Sprint 1 / Dia 19
-- ═══════════════════════════════════════════════════

-- Helper function: retorna o tenant_id do usuário logado
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── Tabela: tenants ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT TRUE,
  plan TEXT NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter', 'pro', 'enterprise')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_see_own" ON tenants
  FOR SELECT USING (id = get_tenant_id());

CREATE POLICY "super_admin_all_tenants" ON tenants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ── Tabela: customers (clientes do ISP) ─────────────
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cpf TEXT,
  plan_id TEXT,
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers (tenant_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own_customers" ON customers
  USING (tenant_id = get_tenant_id());

CREATE POLICY "super_admin_all_customers" ON customers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- ── Tabela: tickets ──────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID REFERENCES customers(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to UUID REFERENCES users(id),
  resolved_by_ai BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON tickets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (tenant_id, status);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own_tickets" ON tickets
  USING (tenant_id = get_tenant_id());

-- ── Tabela: conversations (histórico do AstroChat) ──
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID REFERENCES customers(id),
  channel TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp', 'webchat', 'facebook')),
  status TEXT DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'escalated')),
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations (tenant_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own_conversations" ON conversations
  USING (tenant_id = get_tenant_id());

-- ── Tabela: messages ────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  from_ai BOOLEAN DEFAULT FALSE,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_tenant ON messages (tenant_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own_messages" ON messages
  USING (tenant_id = get_tenant_id());

-- ── Verificar RLS ativo em todas as tabelas ──────────
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Todas as tabelas devem ter rowsecurity = true
