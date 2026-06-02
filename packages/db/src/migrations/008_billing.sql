-- Módulo de Faturamento
CREATE TABLE IF NOT EXISTS billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  speed_mbps INTEGER,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_plans" ON billing_plans USING (tenant_id = get_tenant_id());

-- Faturas
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  plan_id UUID REFERENCES billing_plans(id),
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_method TEXT,
  external_id TEXT,          -- ID no gateway de pagamento
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices (due_date);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_invoices" ON invoices USING (tenant_id = get_tenant_id());

-- Régua de cobrança CobrAI
CREATE TABLE IF NOT EXISTS cobrai_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  days_overdue INTEGER NOT NULL,   -- quantos dias de atraso para disparar
  action TEXT NOT NULL
    CHECK (action IN ('send_message', 'suspend_signal', 'reactivate', 'notify_human')),
  message_template TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cobrai_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_cobrai_rules" ON cobrai_rules USING (tenant_id = get_tenant_id());

-- Jobs de cobrança ativos (BullMQ persistent state)
CREATE TABLE IF NOT EXISTS cobrai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_id UUID REFERENCES invoices(id),
  bullmq_job_id TEXT,
  rule_id UUID REFERENCES cobrai_rules(id),
  status TEXT DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'sent', 'cancelled', 'failed')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cobrai_jobs_tenant ON cobrai_jobs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cobrai_jobs_customer ON cobrai_jobs (customer_id, status);

ALTER TABLE cobrai_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own_cobrai_jobs" ON cobrai_jobs USING (tenant_id = get_tenant_id());
