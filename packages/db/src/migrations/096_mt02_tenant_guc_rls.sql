-- =============================================================================
-- 096 — MT-02 opção (c): RLS por session-var (defesa em profundidade SEM JWT Supabase).
--
-- ⚠️ NÃO APLICADA — staged localmente (mesma disciplina da 094/095). Revisar + aplicar
-- com `npm run db:migrate` quando o dono aprovar. Idempotente (CREATE OR REPLACE).
--
-- PROBLEMA (MT-02): o backend acessa o banco por service_role, que BYPASSA a RLS —
-- o isolamento depende de `.where(tenant)` manual. O ideal (client por-request com JWT
-- do usuário) esbarra no fato do apps/api emitir JWT PRÓPRIO, não do Supabase Auth →
-- `auth.uid()` seria NULL e a RLS negaria tudo.
--
-- SOLUÇÃO (c): tornar `get_tenant_id()` ciente de um GUC de sessão `app.current_tenant`.
-- Uma conexão `pg` por-request (helper `withTenantRLS`) faz, dentro de UMA transação,
-- `SET LOCAL ROLE authenticated` + `set_config('app.current_tenant', <tenant>, true)`.
-- A RLS então isola por tenant SEM depender de JWT Supabase — funciona com a auth atual.
--
-- SEGURANÇA: o `auth.uid()` (caminho JWT real, via PostgREST) tem PRIORIDADE; o GUC é só
-- fallback quando `auth.uid()` é NULL (o caminho da conexão pg direta). No caminho PostgREST
-- (anon/authenticated), o GUC `app.current_tenant` NÃO é setável pelo cliente e fica vazio →
-- `NULLIF(...,'')` vira NULL → `get_tenant_id()` NULL → a RLS NEGA (fail-closed). O GUC só é
-- setado pela conexão de servidor confiável, a partir do tenantId do token JÁ verificado.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(
    -- 1) Caminho JWT (Supabase Auth via PostgREST): prioritário.
    (SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1),
    -- 2) Fallback: GUC de sessão setado pelo helper de backend confiável (MT-02 opção c).
    NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
$$;

-- Nota: `is_super_admin()` continua baseado em auth.uid(); no caminho pg-direto o super_admin
-- não é inferível pelo GUC (por design — o helper serve a operações tenant-scoped, não a
-- bypass de super_admin). Rotas super_admin seguem pelo caminho autenticado/serviço.
