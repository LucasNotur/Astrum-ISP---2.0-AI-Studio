-- infra/sql/create-zep-user.sql
-- Rodar UMA VEZ no Supabase SQL Editor antes de subir o Zep
-- Substitua 'SENHA_FORTE_AQUI' por uma senha gerada com openssl

-- 1. Criar usuário isolado para Zep
CREATE USER zep_user WITH PASSWORD 'SENHA_FORTE_AQUI';

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
