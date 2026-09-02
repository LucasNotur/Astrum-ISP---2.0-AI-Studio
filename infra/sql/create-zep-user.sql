-- infra/sql/create-zep-user.sql
-- Rodar UMA VEZ antes de subir o Zep.
--
-- SEC #5 (auditoria 2026-09-01): NÃO existe mais senha literal neste arquivo (evita criar
-- um usuário de banco com senha fraca se o script for executado verbatim). A senha vem de
-- uma variável psql `zep_password`, gerada como os demais segredos (scripts/generate-secrets.sh):
--
--   ZEP_PASS="$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")"
--   psql "$SUPABASE_DB_URL" -v zep_password="$ZEP_PASS" -f infra/sql/create-zep-user.sql
--
-- Guarde o valor gerado no .env (ZEP_POSTGRES_DSN). Se rodar sem `-v zep_password=...`,
-- o psql aborta (variável indefinida) em vez de criar o usuário com uma senha placeholder.
-- O SQL Editor do Supabase NÃO interpola `:'var'`; use psql (ou cole uma senha forte gerada).

-- 1. Criar usuário isolado para Zep (senha via variável psql, nunca hardcoded)
CREATE USER zep_user WITH PASSWORD :'zep_password';

-- 2. Criar schema exclusivo para Zep
CREATE SCHEMA IF NOT EXISTS zep;

-- 3. Dar acesso somente ao schema zep
GRANT USAGE  ON SCHEMA zep TO zep_user;
GRANT CREATE ON SCHEMA zep TO zep_user;

-- 4. Privilégios padrão para tabelas futuras criadas pelo Zep
ALTER DEFAULT PRIVILEGES IN SCHEMA zep
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO zep_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA zep
  GRANT USAGE, SELECT ON SEQUENCES TO zep_user;

-- 5. Revogar qualquer acesso acidental a schemas críticos
REVOKE ALL ON SCHEMA public FROM zep_user;
REVOKE ALL ON SCHEMA auth   FROM zep_user;

-- 6. Verificar (deve mostrar apenas 'zep')
SELECT schema_name
FROM information_schema.role_usage_grants
WHERE grantee = 'zep_user';
