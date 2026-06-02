-- Tabela de usuários da Astrum (multi-tenant)
-- Separada da auth.users do Supabase para dados extras

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- Argon2id hash
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator'
    CHECK (role IN ('super_admin', 'admin', 'operator', 'viewer')),
  tenant_id UUID NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas dados do seu tenant
CREATE POLICY "tenant_isolation" ON users
  USING (tenant_id = (
    SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1
  ));

-- Super admin vê tudo
CREATE POLICY "super_admin_all" ON users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

COMMENT ON TABLE users IS
  'Usuários da plataforma Astrum. Senha hasheada com Argon2id.
   Criada Sprint 1 Dia 17. Multi-tenant com RLS.';
