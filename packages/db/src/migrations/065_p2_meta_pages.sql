-- P2-01: mapeamento página Meta → tenant
-- Suporta Instagram DM e Messenger no mesmo funil de mensagens

CREATE TABLE IF NOT EXISTS tenant_meta_pages (
  page_id           text PRIMARY KEY,
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  page_type         text NOT NULL CHECK (page_type IN ('instagram', 'messenger')),
  page_access_token text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_meta_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_meta_pages_tenant ON tenant_meta_pages
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS tenant_meta_pages_tenant ON tenant_meta_pages(tenant_id);
