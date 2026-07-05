-- 029_ragas_guardrails.sql — S106: RAGAS evaluation scores + guardrail blocks

CREATE TABLE IF NOT EXISTS ai_ragas_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES tickets(id),
  message_id UUID REFERENCES messages(id),
  faithfulness       NUMERIC(4,3),   -- 0.0–1.0
  answer_relevancy   NUMERIC(4,3),
  context_precision  NUMERIC(4,3),
  context_recall     NUMERIC(4,3),
  overall_score      NUMERIC(4,3),
  model              TEXT,
  evaluated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ragas_tenant ON ai_ragas_scores (tenant_id, evaluated_at DESC);

ALTER TABLE ai_ragas_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY ragas_tenant ON ai_ragas_scores USING (tenant_id = get_tenant_id());

-- Guardrail blocks (topics/entities that were rejected by the AI safety layer)
CREATE TABLE IF NOT EXISTS ai_guardrail_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES tickets(id),
  rule TEXT NOT NULL,          -- e.g. 'off_topic', 'pii_detected', 'profanity', 'competitor_mention'
  user_message TEXT,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardrail_tenant ON ai_guardrail_blocks (tenant_id, blocked_at DESC);

ALTER TABLE ai_guardrail_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY guardrail_tenant ON ai_guardrail_blocks USING (tenant_id = get_tenant_id());
