-- =============================================================================
-- 097 — Tabela `departments` (Fase 1 migração Express→Fastify).
--
-- Antes: o frontend LIA de `tenants.departments` (coluna JSONB que NÃO EXISTE →
-- lista sempre vazia) e ESCREVIA em `/api/departments/*` (Express não montava → 404).
-- Feature 100% quebrada. Construída como tabela relacional própria (não JSONB):
-- consultável, indexável, com RLS por tenant no padrão do projeto.
--
-- Idempotente. Aplicada via MCP + registrada em schema_migrations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.departments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  name                  text NOT NULL,
  sla_response_minutes  integer NOT NULL DEFAULT 15,
  sla_resolution_hours  integer NOT NULL DEFAULT 24,
  required_skills       text[]  NOT NULL DEFAULT '{}',
  color                 text    NOT NULL DEFAULT '#3b82f6',
  routing_mode          text    NOT NULL DEFAULT 'load_balanced',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departments_tenant ON public.departments(tenant_id);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments FORCE ROW LEVEL SECURITY;

-- Isolamento por tenant (padrão tenant_own_*): get_tenant_id() serve de USING e,
-- por ausência de WITH CHECK, também de check no INSERT/UPDATE.
DROP POLICY IF EXISTS tenant_own_departments ON public.departments;
CREATE POLICY tenant_own_departments ON public.departments
  FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS super_admin_all_departments ON public.departments;
CREATE POLICY super_admin_all_departments ON public.departments
  FOR ALL USING (public.is_super_admin());

-- anon nunca acessa (P0-B); authenticated acessa sob RLS.
REVOKE ALL ON public.departments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
