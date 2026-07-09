-- IA-31: Ranking Elo de configurações de modelo+prompt.

CREATE TABLE IF NOT EXISTS elo_contenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  key text NOT NULL,
  rating numeric NOT NULL DEFAULT 1000,
  games int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS elo_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  winner_key text NOT NULL,
  loser_key text NOT NULL,
  draw boolean NOT NULL DEFAULT false,
  source text NOT NULL CHECK (source IN ('replay', 'eval', 'manual')),
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_elo_matches_tenant_ref
  ON elo_matches (tenant_id, ref_id);

ALTER TABLE elo_contenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE elo_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY elo_contenders_tenant ON elo_contenders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY elo_matches_tenant ON elo_matches
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
