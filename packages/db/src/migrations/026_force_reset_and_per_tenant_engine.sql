-- 026_force_reset_and_per_tenant_engine.sql
-- Decisões do Lucas (2026-07-01):
--  1) Migração de senha por 'force_reset' (S77): usuário migrado do Firebase redefine
--     a senha no primeiro login (hash scrypt do Firebase é incompatível com Argon2id).
--  2) Cutover canário por tenant (S74): a engine de atendimento pode ser resolvida
--     por tenant, com a env ATENDIMENTO_ENGINE como default. Vira ISP por ISP.

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT FALSE;

-- 'legacy' | 'v2' | NULL (NULL = usa o default da env ATENDIMENTO_ENGINE)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS atendimento_engine TEXT;
