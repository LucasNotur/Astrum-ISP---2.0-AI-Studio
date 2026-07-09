-- IA-29: Active learning — labeled_examples.

CREATE TABLE IF NOT EXISTS labeled_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  source text NOT NULL CHECK (source IN (
    'safety_review', 'feedback', 'replay_resolution', 'ocr_correction', 'manual'
  )),
  input text NOT NULL,
  output text,
  label text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  labeled_at timestamptz,
  exported_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_labeled_examples_dedupe
  ON labeled_examples (tenant_id, source, md5(input));

CREATE INDEX IF NOT EXISTS idx_labeled_examples_tenant_source
  ON labeled_examples (tenant_id, source, created_at DESC);

ALTER TABLE labeled_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY labeled_examples_tenant ON labeled_examples
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
