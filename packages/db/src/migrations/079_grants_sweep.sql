-- =============================================================================
-- 079 — Varredura completa de GRANTs (o buraco vinha desde as migrations P1).
-- Regra de segurança:
--  · service_role: acesso a TODAS as tabelas (a chave secreta do backend —
--    é o que o supabase-js server-side usa; sem isso o motor v2 não escreve).
--  · authenticated: SOMENTE tabelas com RLS ATIVA (a política decide as linhas;
--    tabela sem RLS não ganha grant para não virar vazamento via REST).
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t.relname);
  END LOOP;
END $$;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
