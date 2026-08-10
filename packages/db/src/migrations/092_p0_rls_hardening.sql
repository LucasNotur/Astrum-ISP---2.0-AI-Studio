-- =============================================================================
-- 092 — Hardening de RLS / isolamento multi-tenant (P0 da auditoria 2026-08-10).
-- APLICADA EM PRODUÇÃO via MCP em 2026-08-10 e verificada (teste de isolamento +
-- teste de escalada). Toda a migration é IDEMPOTENTE — re-rodar pelo runner é seguro.
-- Referências: docs/AUDITORIA_PREPROD_2026-08-10.md, docs/remediation/.
--
-- Fecha:
--   P0-A  views SECURITY DEFINER vazavam cross-tenant
--   P0-B  role `anon` com GRANT total + ausência de FORCE RLS
--   P0-C  funções SECURITY DEFINER com search_path mutável / exec por anon
--   MT-01 auto-elevação a super_admin / troca de tenant_id via UPDATE em users
--   +     schema_migrations exposta sem RLS; 2 funções helper com search_path mutável
-- =============================================================================

-- ── P0-C: funções de RLS com search_path fixo e refs qualificadas ────────────
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'); $$;

CREATE OR REPLACE FUNCTION public.has_permission(p_resource text, p_action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role IS NULL THEN RETURN FALSE; END IF;
  IF v_role = 'super_admin' THEN RETURN TRUE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE role = v_role AND (resource = p_resource OR resource = '*') AND (action = p_action OR action = '*')
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_id()            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin()           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_tenant_id()            TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_super_admin()           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.has_permission(text, text) TO authenticated, service_role;

-- ── P0-A: views deixam de bypassar RLS (security_invoker) e não são públicas ──
ALTER VIEW public.vw_agent_customers SET (security_invoker = true);
ALTER VIEW public.vw_agent_invoices  SET (security_invoker = true);
ALTER VIEW public.vw_agent_tickets   SET (security_invoker = true);
REVOKE ALL   ON public.vw_agent_customers, public.vw_agent_invoices, public.vw_agent_tickets FROM anon;
GRANT SELECT ON public.vw_agent_customers, public.vw_agent_invoices, public.vw_agent_tickets TO authenticated;

-- ── MT-01: bloquear auto-elevação de role/tenant_id ──────────────────────────
-- SECURITY INVOKER é essencial: com DEFINER, current_user vira o dono (postgres)
-- dentro da função e a guarda nunca casaria. INVOKER reflete o chamador real
-- (authenticated/anon bloqueia; service_role/postgres passa — backend intacto).
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_self_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated','anon')
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id)
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Alteracao de role/tenant_id nao permitida (privilege escalation bloqueada)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.prevent_user_privilege_self_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_users_no_priv_self_change ON public.users;
CREATE TRIGGER trg_users_no_priv_self_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_user_privilege_self_change();

-- ── P0-B: revogar anon + FORCE RLS nas tabelas tenant-scoped ─────────────────
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema='public' AND col.table_name=c.relname AND col.column_name='tenant_id'
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity = true
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;

-- ── Extras de hardening ──────────────────────────────────────────────────────
-- REVISAR: se existir página pública (status/telemetria) que precise de anon,
-- reconceder o mínimo explicitamente aqui (deixado comentado de propósito):
-- GRANT SELECT ON public.status_incidents TO anon;

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;       -- deny-all; runner usa service_role (bypass)
ALTER FUNCTION public.create_default_cobrai_rules() SET search_path = public;
ALTER FUNCTION public.set_sales_leads_updated_at()  SET search_path = public;

-- Nota: as funções get_tenant_id/is_super_admin/has_permission permanecem EXECUTE
-- para `authenticated` de propósito — o RLS as avalia no contexto do usuário e elas
-- só retornam o próprio tenant/permissão (advisor WARN é falso-positivo aqui).
-- Nota: legacy_docs/node_latency_daily/outbox/role_permissions ficam RLS-on sem
-- policy = deny-all intencional (service_role faz bypass; has_permission lê role_permissions).
