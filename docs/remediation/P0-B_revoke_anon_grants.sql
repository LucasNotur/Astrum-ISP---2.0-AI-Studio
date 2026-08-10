-- =============================================================================
-- P0-B — role `anon` com GRANT total em ~104 tabelas + ausência de FORCE RLS.
-- PROPOSTA — revisar e testar em branch antes de aplicar.
--
-- Contexto: as migrations 078/079 concederam acesso a `authenticated` e `service_role`
-- (a intenção documentada em 079 era JUSTAMENTE não dar nada a anon). Os grants de `anon`
-- vêm do default do Supabase. Hoje `anon` tem SELECT/INSERT/UPDATE/DELETE/TRUNCATE em todas
-- as tabelas public. O RLS ainda nega (auth.uid() NULL → get_tenant_id() NULL), mas isso é
-- uma superfície que não deveria existir: qualquer policy permissiva futura (ou uma view/
-- função como o P0-A) vira vazamento imediato. Princípio: anon = zero acesso a dados.
-- =============================================================================

-- 1) Revogar tudo de anon no schema public (tabelas, sequences, funções).
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- 2) Impedir que tabelas/funções futuras voltem a nascer com grant para anon.
--    (Espelha o padrão da 078, mas para RETIRAR anon do default.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

-- 3) REVISAR: se houver superfície LEGITIMAMENTE pública (ex.: página de status usando
--    `status_incidents`/`node_latency_daily` sem login), reconceda o mínimo explicitamente.
--    Deixe COMENTADO até confirmar que a tela existe e precisa de anon:
-- GRANT SELECT ON public.status_incidents TO anon;

-- 4) FORCE ROW LEVEL SECURITY nas tabelas com tenant_id (defesa em profundidade).
--    service_role tem BYPASSRLS → NÃO é afetado (backend continua escrevendo normalmente).
--    FORCE fecha o caso de uma query rodar como o owner da tabela.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema='public' AND col.table_name=c.relname AND col.column_name='tenant_id'
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity = true
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;

-- Verificação: anon não deve ter privilégio algum em public.
--   SELECT count(*) FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND grantee='anon';   -- esperado: 0 (ou só o allowlist do passo 3)
