-- ============================================================================
-- 107 — 2º fator (TOTP) para o login PRÓPRIO do apps/api.
--
-- Contexto: a migration 106 endureceu is_super_admin() (RLS/Supabase Auth),
-- mas cobre só o caminho do frontend legado via supabase-js. O login do
-- apps/api (POST /api/v2/auth/login — senha contra users.password_hash) é
-- uma auth TOTALMENTE separada, sem nenhum conceito de MFA/AAL (documentado
-- em docs/SEGURANCA_PENDENTE.md, item "MFA + break-glass"). Esta migration
-- adiciona as colunas necessárias para fechar esse gap.
--
-- Padrão condicional igual ao da 106: enquanto totp_enabled=false (default),
-- login por senha continua funcionando normalmente — o gate só liga depois
-- que o próprio usuário completa o enrollment (POST /mfa/enroll + /mfa/verify).
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN users.totp_secret_enc IS
  'Secret TOTP (RFC 6238) cifrado com ERP_CRED_KEY (mesmo envelope iv:tag:cipher do
   adapters/erp/credential-cipher.ts, ver encryptString/decryptString). NULL até o
   primeiro enroll. Sobrevive a disable (reaproveitado) — ver mfa.service.ts.';

COMMENT ON COLUMN users.totp_enabled IS
  'TRUE somente após POST /api/v2/auth/mfa/verify confirmar o código. Enquanto FALSE,
   POST /api/v2/auth/login emite tokens completos direto (sem 2º passo).';
