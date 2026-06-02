-- Tabela de auditoria para ações críticas de segurança
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  user_id UUID,
  action TEXT NOT NULL,         -- ex: 'login', 'logout', 'permission_denied', 'token_revoked'
  resource TEXT,                -- ex: 'tickets', 'customers'
  resource_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Audit log é apenas append — ninguém pode deletar
CREATE POLICY "tenant_read_own_audit" ON audit_log
  FOR SELECT USING (tenant_id = get_tenant_id());

CREATE POLICY "super_admin_all_audit" ON audit_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

COMMENT ON TABLE audit_log IS
  'Log imutável de ações críticas de segurança. Apenas INSERT permitido para usuários normais.';
