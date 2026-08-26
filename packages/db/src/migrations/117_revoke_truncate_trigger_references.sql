-- =============================================================================
-- 117 — REVOKE TRUNCATE/TRIGGER/REFERENCES de anon/authenticated em todas as
--       tabelas do schema public (achado colateral da S2, PLANO_ACAO_100_OPERACIONAL.md).
--
-- Contexto: o `ALTER DEFAULT PRIVILEGES` do projeto (herdado do setup padrão do
-- Supabase) dá a `authenticated` — em praticamente todas as tabelas, não só as
-- 5 deny-all fechadas pela migration 113 — também TRUNCATE, TRIGGER e
-- REFERENCES, além de SELECT/INSERT/UPDATE/DELETE. RLS NÃO cobre TRUNCATE (não
-- é row-scoped), então a RLS por tenant não protege contra um TRUNCATE vindo de
-- um contexto `authenticated`. `anon` já não tem nenhum grant desde a 092
-- (confirmado antes desta migration: 0 tabelas com REFERENCES/TRIGGER/TRUNCATE
-- para anon) — incluído no REVOKE só por defesa em profundidade / idempotência.
--
-- Mitigador que já existia antes desta migration (não é o motivo pra não fechar
-- isso, só contexto de risco): `authenticated` é NOLOGIN — só se chega nele via
-- PostgREST (que não expõe TRUNCATE/DDL) ou via `SET ROLE` numa conexão de
-- servidor confiável (padrão MT-02c `withTenantRLS`).
--
-- SELECT/INSERT/UPDATE/DELETE para `authenticated` são MANTIDOS — são
-- necessários (o caminho MT-02c roda como `authenticated`); só as 3 permissões
-- nunca usadas por nada no código são revogadas.
--
-- Idempotente (REVOKE de algo que já não existe não é erro). Aplicada via MCP
-- + registrada em schema_migrations.
-- =============================================================================

REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Fecha a mesma porta para tabelas futuras criadas pelo role `postgres` (todas
-- as migrations do repo rodam como esse role). NÃO cobre tabelas futuras
-- criadas por `supabase_admin` (setup interno do Supabase) — testado nesta
-- sessão: `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` dá
-- "permission denied to change default privileges" mesmo pra `postgres`; só o
-- próprio `supabase_admin` pode alterar seus defaults. Mitigador: tabela nova
-- criada por `supabase_admin` só acontece via ferramenta interna do Supabase
-- (não é o caminho normal deste projeto, que sempre cria tabela via migration
-- rodando como `postgres`) — mas fica registrado como gap caso isso mude.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
