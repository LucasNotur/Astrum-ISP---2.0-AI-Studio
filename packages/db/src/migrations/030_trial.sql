-- 030_trial.sql — S109: suporte a período de trial de 14 dias

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_step  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_done  BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN tenants.trial_ends_at IS 'NULL = tenant pagante; data futura = em trial; data passada = trial expirado';
