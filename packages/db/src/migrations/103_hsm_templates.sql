-- =============================================================================
-- 103 — Tabela `hsm_templates` (Fase 3 — corrige feature quebrada).
--
-- Achado: `src/pages/WhatsAppPage.tsx` (aba "Templates HSM") chama
-- `/api/hsm-templates` desde sempre, mas `src/routes/hsmTemplatesRouter` NUNCA
-- foi montado em `server.ts` (bug pré-existente, não trash — inventariado no
-- PLANO_MIGRACAO_EXPRESS_FASTIFY.md §5). Além disso o router legado gravava
-- `components` (campo que o front nunca envia) e `src/lib/whatsappSender.ts`
-- (o ENVIO real via Evolution) lia `template.body` — dois contratos
-- inconsistentes que nunca se encontraram. A tabela abaixo usa o shape real que
-- o front envia (`name/category/language/header_type/header_content/body/footer`),
-- que também é o que `whatsappSender.ts` precisa pra montar a mensagem.
--
-- Idempotente. Aplicada via MCP + registrada em schema_migrations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hsm_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  name            text NOT NULL,
  category        text NOT NULL DEFAULT 'MARKETING' CHECK (category IN ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  language        text NOT NULL DEFAULT 'pt_BR',
  header_type     text NOT NULL DEFAULT 'none' CHECK (header_type IN ('none', 'text', 'image', 'document')),
  header_content  text,
  body            text NOT NULL,
  footer          text,
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, language)
);

CREATE INDEX IF NOT EXISTS idx_hsm_templates_tenant ON public.hsm_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hsm_templates_lookup ON public.hsm_templates(tenant_id, name, status);

ALTER TABLE public.hsm_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hsm_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_own_hsm_templates ON public.hsm_templates;
CREATE POLICY tenant_own_hsm_templates ON public.hsm_templates
  FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS super_admin_all_hsm_templates ON public.hsm_templates;
CREATE POLICY super_admin_all_hsm_templates ON public.hsm_templates
  FOR ALL USING (public.is_super_admin());

REVOKE ALL ON public.hsm_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hsm_templates TO authenticated;
