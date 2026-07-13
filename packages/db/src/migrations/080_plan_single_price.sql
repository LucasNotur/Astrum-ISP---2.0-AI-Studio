-- =============================================================================
-- 080 — Revisão final do preço (Lucas, 2026-07-13): R$ 2,50 × assinantes em
-- QUALQUER quantidade, sem faixas nem almoço grátis. O Radar deixa de ser
-- plano grátis permanente e vira trial de 14 dias (radar_trial).
-- Substitui a taxonomia da 075.
-- =============================================================================

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check
  CHECK (plan IN (
    'radar_trial', 'astrum',                          -- a escada final
    'radar', 'operacao', 'autonomia', 'enterprise',   -- 075 (migrar e remover)
    'starter', 'pro'                                  -- legado (migrar e remover)
  ));

-- Tenants da taxonomia intermediária 075 (nunca usada em produção) → plano único.
UPDATE tenants SET plan = 'astrum' WHERE plan IN ('operacao', 'autonomia', 'enterprise');
UPDATE tenants SET plan = 'radar_trial' WHERE plan = 'radar';
