-- 025_cobrai_tenant_config.sql
-- Plano Mestre V2, S76. Config de régua CobrAI por tenant (portada do Firestore legado:
-- cobrai_window / cobrai_hourly_limit / cobrai_stages). Consumida por cobrai-guards.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cobrai_window JSONB;          -- {"start":8,"end":20}
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cobrai_hourly_limit INTEGER DEFAULT 30;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cobrai_daily_limit INTEGER;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cobrai_stages JSONB;          -- {"suspensao":{"active":false}}

-- Opt-out de cobrança por cliente (LGPD / preferência).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cobrai_opted_out BOOLEAN DEFAULT FALSE;
