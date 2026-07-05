-- 037_agent_tool_settings.sql
-- IA-19 — Tool registry dinâmico por tenant.
-- Liga/desliga cada `agentTools` (catálogo vive em código) por tenant,
-- com efeito em runtime. Contador de uso diário para a tela de gestão.

CREATE TABLE IF NOT EXISTS agent_tool_settings (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  PRIMARY KEY (tenant_id, tool_name)
);

CREATE TABLE IF NOT EXISTS tool_usage_daily (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  day DATE NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, tool_name, day)
);

ALTER TABLE agent_tool_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON agent_tool_settings;
CREATE POLICY tenant_isolation ON agent_tool_settings
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

DROP POLICY IF EXISTS tenant_isolation ON tool_usage_daily;
CREATE POLICY tenant_isolation ON tool_usage_daily
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_agent_tool_settings_tenant ON agent_tool_settings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tool_usage_daily_tenant_day ON tool_usage_daily (tenant_id, day DESC);
