-- Rastreamento de jobs da Batch API
CREATE TABLE IF NOT EXISTS ai_batch_jobs (
  id TEXT PRIMARY KEY,               -- OpenAI batch ID
  tenant_id UUID REFERENCES tenants(id),
  job_type TEXT NOT NULL,            -- 'churn_analysis' | 'ticket_classification'
  request_count INTEGER,
  status TEXT DEFAULT 'in_progress', -- 'in_progress' | 'completed' | 'failed'
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_batch_jobs_tenant ON ai_batch_jobs(tenant_id, status);

-- Predições de churn
CREATE TABLE IF NOT EXISTS churn_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  tenant_id UUID REFERENCES tenants(id),
  churn_probability NUMERIC(4,3),
  churn_risk TEXT CHECK (churn_risk IN ('low','medium','high','critical')),
  main_factors JSONB,
  recommended_action TEXT,
  confidence_score NUMERIC(4,3),
  predicted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, DATE(predicted_at)) -- 1 predição por cliente por dia
);

CREATE INDEX idx_churn_tenant_risk ON churn_predictions(tenant_id, churn_risk, predicted_at DESC);

-- RLS: tenant só vê seus dados
ALTER TABLE ai_batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE churn_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_jobs_tenant ON ai_batch_jobs
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY churn_predictions_tenant ON churn_predictions
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
