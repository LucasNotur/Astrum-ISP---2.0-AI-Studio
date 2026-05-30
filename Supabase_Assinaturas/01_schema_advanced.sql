-- Schema SQL Avançado para Faturamento SaaS B2B

-- Tabela: plans
-- Objetivo: Define a camada de planos base com metadados para controle elástico e customizável.
CREATE TABLE public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
    pricing_strategy TEXT NOT NULL CHECK (pricing_strategy IN ('flat_rate', 'tiered', 'volume', 'pay_as_you_go')),
    base_price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    trial_days INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela: plan_features
-- Objetivo: Liberar ou bloquear módulos da UI / Features Booleanas associadas ao plano.
CREATE TABLE public.plan_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL, -- Ex: 'advanced_analytics', 'custom_domain'
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_plan_feature UNIQUE (plan_id, feature_key)
);

-- Tabela: plan_quotas
-- Objetivo: Controle de limites quantitativos simples com possibilidade de overage linear.
CREATE TABLE public.plan_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    limit_value INTEGER NOT NULL DEFAULT -1, -- -1 para ilimitado
    overage_price NUMERIC(10,4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_plan_quota UNIQUE (plan_id, metric_type)
);

-- Tabela: pricing_tiers
-- Objetivo: Precificação em degraus (Tiers). Usada se pricing_strategy = 'tiered' ou 'volume'.
-- Exemplo: 0 a 1000 tokens custam 1.0; 1001 a 5000 custam 0.50.
CREATE TABLE public.pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    tier_start INTEGER NOT NULL,
    tier_end INTEGER, -- Pode ser NULL para representar o último degrau (ex: acima de N)
    unit_price NUMERIC(10,4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (tier_end IS NULL OR tier_end > tier_start)
);

-- Tabela: subscriptions
-- Objetivo: Gerir as assinaturas ativas de cada provedor (tenant_id).
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
    trial_end TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela: usage_counters
-- Objetivo: Registrar o sumário de consumo atual por tenant na janela de faturamento corrente.
CREATE TABLE public.usage_counters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    metric_type TEXT NOT NULL,
    current_usage INTEGER NOT NULL DEFAULT 0,
    last_reset TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_tenant_counter UNIQUE (tenant_id, metric_type)
);
