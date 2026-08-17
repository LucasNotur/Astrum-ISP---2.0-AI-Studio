-- =============================================================================
-- 104 — Tabela `hsm_send_logs` (auditoria de envio de template HSM).
--
-- `src/lib/whatsappSender.ts` (sendHSMTemplate) registrava isso em
-- `db.collection("hsm_send_logs").add(...)` — sem tabela nativa, ia pro
-- `legacy_docs` genérico (fora do padrão R2). Companion da migration 103
-- (`hsm_templates`).
--
-- Idempotente. Aplicada via MCP + registrada em schema_migrations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hsm_send_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  template_id    uuid REFERENCES public.hsm_templates(id),
  template_name  text NOT NULL,
  recipient      text NOT NULL,
  variables      jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hsm_send_logs_tenant ON public.hsm_send_logs(tenant_id, sent_at DESC);

ALTER TABLE public.hsm_send_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hsm_send_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_own_hsm_send_logs ON public.hsm_send_logs;
CREATE POLICY tenant_own_hsm_send_logs ON public.hsm_send_logs
  FOR ALL USING (tenant_id = public.get_tenant_id());

DROP POLICY IF EXISTS super_admin_all_hsm_send_logs ON public.hsm_send_logs;
CREATE POLICY super_admin_all_hsm_send_logs ON public.hsm_send_logs
  FOR ALL USING (public.is_super_admin());

REVOKE ALL ON public.hsm_send_logs FROM anon;
GRANT SELECT, INSERT ON public.hsm_send_logs TO authenticated;
