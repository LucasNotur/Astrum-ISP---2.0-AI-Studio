-- =============================================================================
-- MT-01 — Auto-elevação a super_admin / troca de tenant_id via UPDATE em `users`.
-- PROPOSTA — revisar e testar em branch antes de aplicar.
--
-- Problema (CONFIRMADO em nível de banco): a policy de `users` é FOR ALL com
--   USING ((id = auth.uid()) OR (tenant_id = get_tenant_id()))  e SEM WITH CHECK.
-- No Postgres, FOR ALL sem WITH CHECK herda a expressão USING como check do UPDATE.
-- Como `id = auth.uid()` continua verdadeiro na própria linha DEPOIS do update, o
-- usuário pode: (a) setar role='super_admin' (escalada vertical) ou (b) setar
-- tenant_id = <tenant da vítima> (invasão cross-tenant) — e ambos passam no check.
-- Requer o GRANT UPDATE de authenticated/anon (ver P0-B) + acesso direto ao PostgREST.
--
-- Correção robusta (independe dos grants existentes): trigger BEFORE UPDATE que
-- impede QUALQUER alteração de role/tenant_id por quem não for super_admin.
-- =============================================================================

-- NOTA (corrigido na aplicação): a função é SECURITY INVOKER, não DEFINER. Com DEFINER,
-- current_user vira o dono (postgres) DENTRO da função e a guarda nunca bloquearia.
-- INVOKER faz current_user refletir o chamador real: authenticated/anon bloqueiam;
-- service_role/postgres (backend/admin) passam. Versão canônica: migration 092.
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated','anon')
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id)
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Alteração de role/tenant_id não permitida (privilege escalation bloqueada)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_user_privilege_self_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_users_no_priv_self_change ON public.users;
CREATE TRIGGER trg_users_no_priv_self_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_privilege_self_change();

-- Defesa em profundidade adicional (REVISAR): também dá para restringir a policy por
-- comando, tornando o WITH CHECK explícito. Mantido comentado para não conflitar com a
-- policy existente sem revisão — o trigger acima já fecha o vetor:
-- DROP POLICY IF EXISTS tenant_isolation ON public.users;
-- CREATE POLICY users_select ON public.users FOR SELECT
--   USING ((id = auth.uid()) OR (tenant_id = get_tenant_id()) OR is_super_admin());
-- CREATE POLICY users_update ON public.users FOR UPDATE
--   USING (id = auth.uid() OR is_super_admin())
--   WITH CHECK (id = auth.uid() OR is_super_admin());

-- Teste (deve FALHAR com insufficient_privilege quando executado como usuário comum):
--   UPDATE public.users SET role='super_admin' WHERE id = auth.uid();
--   UPDATE public.users SET tenant_id='<outro-tenant>' WHERE id = auth.uid();
