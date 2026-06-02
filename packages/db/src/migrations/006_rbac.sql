-- ═══════════════════════════════════════════════════
-- RBAC — Role Based Access Control
-- Sprint 1 / Dia 20
-- ═══════════════════════════════════════════════════

-- Tabela de permissões por role
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  resource TEXT NOT NULL,   -- ex: 'tickets', 'customers', 'billing', 'ai_config'
  action TEXT NOT NULL,     -- ex: 'read', 'write', 'delete', 'admin'
  UNIQUE(role, resource, action)
);

-- Permissões padrão por role
INSERT INTO role_permissions (role, resource, action) VALUES
  -- super_admin: tudo
  ('super_admin', '*', '*'),

  -- admin: tudo dentro do seu tenant
  ('admin', 'tickets', 'read'),
  ('admin', 'tickets', 'write'),
  ('admin', 'tickets', 'delete'),
  ('admin', 'customers', 'read'),
  ('admin', 'customers', 'write'),
  ('admin', 'customers', 'delete'),
  ('admin', 'billing', 'read'),
  ('admin', 'billing', 'write'),
  ('admin', 'ai_config', 'read'),
  ('admin', 'ai_config', 'write'),
  ('admin', 'reports', 'read'),
  ('admin', 'users', 'read'),
  ('admin', 'users', 'write'),

  -- operator: operações do dia a dia
  ('operator', 'tickets', 'read'),
  ('operator', 'tickets', 'write'),
  ('operator', 'customers', 'read'),
  ('operator', 'billing', 'read'),
  ('operator', 'reports', 'read'),

  -- viewer: apenas leitura
  ('viewer', 'tickets', 'read'),
  ('viewer', 'customers', 'read'),
  ('viewer', 'reports', 'read')

ON CONFLICT (role, resource, action) DO NOTHING;

-- Function para verificar permissão
CREATE OR REPLACE FUNCTION has_permission(p_resource TEXT, p_action TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = auth.uid();

  IF v_role IS NULL THEN RETURN FALSE; END IF;

  -- super_admin tem tudo
  IF v_role = 'super_admin' THEN RETURN TRUE; END IF;

  -- Verificar permissão específica
  RETURN EXISTS (
    SELECT 1 FROM role_permissions
    WHERE role = v_role
    AND (resource = p_resource OR resource = '*')
    AND (action = p_action OR action = '*')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
