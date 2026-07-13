-- =============================================================================
-- 078 — GRANTs faltantes (achado da prova de fogo 2026-07-13).
-- Toda tabela criada pelas migrations 071–077 nasceu SEM grant para os papéis
-- do PostgREST (authenticated/service_role) — supabase-js levaria "permission
-- denied" em produção (D-05, D-15, E-01, D-04, plans, ABAC).
-- Corrige as existentes E a classe do bug (default privileges do role postgres).
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  kb_drafts,
  wind_tunnel_runs,
  wind_tunnel_results,
  plans,
  resource_permissions,
  ai_reflections,
  incidents
TO authenticated, service_role;

-- Tabelas futuras criadas por migrations (role postgres) já nascem com grant.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
