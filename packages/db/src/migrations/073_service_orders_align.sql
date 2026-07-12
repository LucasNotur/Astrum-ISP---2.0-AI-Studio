-- =============================================================================
-- 073 — P0-06/checkup: alinha service_orders com o código do apps/api.
-- O schema 015 nasceu do legado (status pt-BR, sem scheduled_for/created_by),
-- mas tools.executor, sales-funnel e subscriber-portal já escrevem/leem
-- status 'open', scheduled_for, created_by e (agora) external_id da OS no ERP.
-- =============================================================================

ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS created_by    TEXT;
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS external_id   TEXT;  -- id da OS no ERP (P0-06)

-- Amplia o vocabulário de status: união do legado (pt-BR) com o motor novo (en).
ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_status_check;
ALTER TABLE service_orders ADD CONSTRAINT service_orders_status_check
  CHECK (status IN (
    'pendente', 'em_deslocamento', 'em_atendimento', 'concluido', 'cancelado',  -- legado
    'open', 'in_progress', 'completed', 'cancelled'                             -- motor novo
  ));

CREATE INDEX IF NOT EXISTS idx_service_orders_external ON service_orders (tenant_id, external_id)
  WHERE external_id IS NOT NULL;
