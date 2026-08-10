-- =============================================================================
-- P0-A — Views SECURITY DEFINER sem filtro de tenant (vazamento cross-tenant).
-- PROPOSTA — revisar e testar em branch antes de aplicar (ver docs/remediation/README.md).
--
-- Problema (confirmado): vw_agent_customers / vw_agent_invoices / vw_agent_tickets
-- são owner=postgres, SECURITY DEFINER (default), e têm SELECT concedido a `anon`.
-- Como SECURITY DEFINER executa como o dono (postgres, bypassa RLS) e as views NÃO
-- filtram tenant_id, qualquer usuário autenticado (ou anon com a apikey pública do
-- bundle) lê customers/invoices/tickets de TODOS os tenants via /rest/v1/vw_agent_*.
--
-- Correção: security_invoker=true faz a view rodar com os privilégios de QUEM CONSULTA,
-- então o RLS das tabelas-base (tenant_id = get_tenant_id()) volta a valer. Além disso,
-- revogamos SELECT de anon (essas views nunca deveriam ser públicas).
-- =============================================================================

ALTER VIEW public.vw_agent_customers SET (security_invoker = true);
ALTER VIEW public.vw_agent_invoices  SET (security_invoker = true);
ALTER VIEW public.vw_agent_tickets   SET (security_invoker = true);

REVOKE ALL ON public.vw_agent_customers FROM anon;
REVOKE ALL ON public.vw_agent_invoices  FROM anon;
REVOKE ALL ON public.vw_agent_tickets   FROM anon;

-- REVISAR: se essas views existem para um papel específico (ex.: "agent"/atendente),
-- conceda SELECT apenas a authenticated (o RLS já restringe as linhas ao tenant):
GRANT SELECT ON public.vw_agent_customers TO authenticated;
GRANT SELECT ON public.vw_agent_invoices  TO authenticated;
GRANT SELECT ON public.vw_agent_tickets   TO authenticated;

-- Verificação pós-aplicação (deve retornar 0 linhas — nenhuma view SECURITY DEFINER):
--   SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--   WHERE n.nspname='public' AND c.relkind='v'
--     AND NOT ('security_invoker=true' = ANY(COALESCE(c.reloptions,'{}')));
-- E get_advisors(security) não deve mais listar security_definer_view.
