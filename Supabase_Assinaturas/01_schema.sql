-- Criação do Schema de Assinaturas e Planos

-- Tabela: public.plans
-- Finalidade: Armazenar os planos de assinatura disponíveis no SaaS Astrum.
CREATE TABLE public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    billing_mode TEXT NOT NULL CHECK (billing_mode IN ('fixed', 'per_active_client', 'hybrid', 'usage_based')),
    base_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'BRL',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela: public.plan_limits
-- Finalidade: Armazenar os limites e custos adicionais (overage) para cada métrica de um plano.
CREATE TABLE public.plan_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL CHECK (metric_type IN ('tokens_ia', 'clientes_ativos', 'mensagens_whatsapp', 'storage_gb')),
    limit_value INTEGER NOT NULL DEFAULT -1, -- -1 significa ilimitado
    overage_price_per_unit NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela: public.subscriptions
-- Finalidade: Armazenar a assinatura atual de cada tenant e seu status.
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela: public.usage_counters
-- Finalidade: Rastrear o uso atual de diversas métricas por tenant.
CREATE TABLE public.usage_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    metric_type TEXT NOT NULL,
    current_usage INTEGER NOT NULL DEFAULT 0,
    last_reset TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_tenant_metric UNIQUE (tenant_id, metric_type)
);
