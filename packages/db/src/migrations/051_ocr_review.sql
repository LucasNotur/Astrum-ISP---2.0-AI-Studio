-- IA-15: OCR multi-layout + fila de revisão humana.

CREATE TABLE IF NOT EXISTS ocr_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid,
  conversation_id uuid,
  media_url text,
  doc_type text CHECK (doc_type IN ('boleto', 'energia', 'concorrente', 'desconhecido')),
  extraction jsonb NOT NULL,
  confidence numeric,
  review_status text NOT NULL DEFAULT 'auto' CHECK (review_status IN ('auto', 'pending', 'approved', 'corrected')),
  corrected jsonb,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_extractions_review
  ON ocr_extractions (tenant_id, review_status, created_at DESC);

ALTER TABLE ocr_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ocr_extractions_tenant ON ocr_extractions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
