-- ═══════════════════════════════════════════════════
-- IA-45 — Sandbox flag para geração de dados sintéticos
-- ═══════════════════════════════════════════════════
-- Marca tenants que podem receber datasets sintéticos. Default FALSE — o
-- tenant só vira sandbox explicitamente. RLS já existe em `tenants`
-- (migration 005), nada a recriar.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN NOT NULL DEFAULT FALSE;

-- As tabelas de domínio precisam distinguir dados sintéticos. O default
-- 'human' preserva o comportamento atual de todas as leituras que ainda
-- não filtram por origem.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'human';

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'human';

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'human';
