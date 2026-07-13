-- =============================================================================
-- 075 — A Escada Astrum (decisão de preço 2026-07-13).
-- tenants.plan passa a aceitar os degraus oficiais (radar/operacao/autonomia/
-- enterprise) mantendo os valores antigos válidos (starter/pro) até a migração
-- comercial dos tenants existentes. Fonte: src/lib/plans.ts (ASTRUM_LADDER) +
-- MODELO_DE_COBRANCA_E_CENARIOS__DECIDIDO.md §5.
-- =============================================================================

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check
  CHECK (plan IN (
    'radar', 'operacao', 'autonomia', 'enterprise',  -- a escada oficial
    'starter', 'pro'                                 -- legado (migrar e remover)
  ));

-- Nº de assinantes do ISP (a base da cobrança R$/assinante). Atualizado pelo
-- conector ERP (P0) ou pelo ETL; NULL = ainda não sincronizado.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscriber_count INT;
