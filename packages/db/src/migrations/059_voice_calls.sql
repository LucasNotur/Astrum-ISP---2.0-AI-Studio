-- IA-13: Speech analytics QA — persistência de chamadas + transcript + scorecard.

CREATE TABLE IF NOT EXISTS voice_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid NULL REFERENCES customers(id),
  phone_last4 text NOT NULL,
  phone_hash text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_s int,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_voice_calls_tenant
  ON voice_calls (tenant_id, started_at DESC);

ALTER TABLE voice_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY voice_calls_tenant ON voice_calls
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS voice_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES voice_calls(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  role text NOT NULL CHECK (role IN ('customer', 'agent')),
  content text NOT NULL,
  t_offset_ms int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_voice_transcripts_call
  ON voice_transcripts (call_id, t_offset_ms);

ALTER TABLE voice_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY voice_transcripts_tenant ON voice_transcripts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS voice_scorecards (
  call_id uuid PRIMARY KEY REFERENCES voice_calls(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  total int NOT NULL,
  criteria jsonb NOT NULL,
  model text NOT NULL DEFAULT 'gpt-4o-mini',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE voice_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY voice_scorecards_tenant ON voice_scorecards
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
