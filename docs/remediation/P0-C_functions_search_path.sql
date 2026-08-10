-- =============================================================================
-- P0-C — Funções SECURITY DEFINER com search_path mutável + executáveis por anon.
-- PROPOSTA — revisar e testar em branch antes de aplicar.
--
-- Problema: get_tenant_id(), is_super_admin(), has_permission() são SECURITY DEFINER
-- SEM `SET search_path`. Um search_path controlável abre a porta para uma função/tabela
-- maliciosa em outro schema sombrear objetos referenciados (escalada via SECURITY DEFINER).
-- Além disso são EXECUTE por anon (via /rest/v1/rpc/*), o que não deveria existir.
--
-- NOTA HONESTA: as 4 tabelas "RLS ON sem policy" (legacy_docs, node_latency_daily, outbox,
-- role_permissions) NÃO são vulnerabilidade — RLS sem policy = deny-all a anon/authenticated,
-- e service_role faz bypass. role_permissions é lida por has_permission() (SECURITY DEFINER,
-- que ignora RLS), então não precisa de policy para authenticated. Deixá-las em deny-all é
-- CORRETO; documentado aqui para o advisor INFO não ser confundido com risco.
-- =============================================================================

-- 1) Fixar search_path (recria preservando o corpo atual — confira o corpo antes de aplicar).
ALTER FUNCTION public.get_tenant_id()                      SET search_path = '';
ALTER FUNCTION public.is_super_admin()                     SET search_path = '';
ALTER FUNCTION public.has_permission(text, text)           SET search_path = '';
-- REVISAR: se os corpos referenciam `users`/`role_permissions` sem schema, será preciso
-- qualificar como `public.users` / `public.role_permissions` ao recriar (com search_path=''
-- não há schema implícito). Ex.: get_tenant_id deve virar
--   SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1;

-- 2) Revogar EXECUTE de anon (authenticated PRECISA manter — as funções são usadas dentro
--    das policies RLS avaliadas no contexto do usuário autenticado).
REVOKE EXECUTE ON FUNCTION public.get_tenant_id()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin()           FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text, text) FROM anon;

-- Verificação: get_advisors(security) não deve mais listar function_search_path_mutable
-- nem anon_security_definer_function_executable para essas três funções.
