-- Schema SQL Avançado - Motor de Faturamento SaaS B2B (Padrão Stripe)

-- 1. Tabela: products (Catálogo de Produtos)
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_products_metadata ON public.products USING GIN (metadata);

-- 2. Tabela: prices (Modelos de Preço baseados em produtos)
CREATE TABLE public.prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    currency TEXT NOT NULL DEFAULT 'brl',
    unit_amount NUMERIC(15,4), -- Preço fixo (pode ser nulo em tiered pricing sem flat setup)
    billing_scheme TEXT NOT NULL CHECK (billing_scheme IN ('per_unit', 'tiered')),
    recurring_interval TEXT CHECK (recurring_interval IN ('month', 'year', 'week', 'day')),
    tax_behavior TEXT NOT NULL CHECK (tax_behavior IN ('inclusive', 'exclusive', 'unspecified')),
    tiers_mode TEXT CHECK (tiers_mode IN ('volume', 'graduated')),
    active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_prices_product_id ON public.prices(product_id);
CREATE INDEX idx_prices_metadata ON public.prices USING GIN (metadata);

-- 3. Tabela: price_tiers (Degraus de precificação se billing_scheme = 'tiered')
CREATE TABLE public.price_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    price_id UUID NOT NULL REFERENCES public.prices(id) ON DELETE CASCADE,
    up_to INTEGER, -- NULL representa infinito
    flat_amount NUMERIC(15,4),
    unit_amount NUMERIC(15,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_price_tiers_price_id ON public.price_tiers(price_id);

-- 4. Tabela: coupons (Cupons de desconto)
CREATE TABLE public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    amount_off NUMERIC(15,4),
    percent_off NUMERIC(5,2) CHECK (percent_off >= 0 AND percent_off <= 100),
    currency TEXT,
    duration TEXT NOT NULL CHECK (duration IN ('once', 'repeating', 'forever')),
    duration_in_months INTEGER,
    max_redemptions INTEGER,
    times_redeemed INTEGER NOT NULL DEFAULT 0,
    valid BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((amount_off IS NOT NULL AND percent_off IS NULL) OR (amount_off IS NULL AND percent_off IS NOT NULL))
);
CREATE INDEX idx_coupons_metadata ON public.coupons USING GIN (metadata);

-- 5. Tabela: discounts (Aplicação de desconto para um tenant/subscription)
CREATE TABLE public.discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL, -- FK de tenant se aplicável
    coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
    subscription_id UUID, -- Se nulo, aplica ao tenant em todas faturas
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_discounts_tenant_id ON public.discounts(tenant_id);
CREATE INDEX idx_discounts_coupon_id ON public.discounts(coupon_id);
CREATE INDEX idx_discounts_subscription_id ON public.discounts(subscription_id);

-- 6. Tabela: subscriptions (Assinaturas Ativas/Inativas)
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subscriptions_tenant_id ON public.subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_metadata ON public.subscriptions USING GIN (metadata);

-- 7. Tabela: subscription_items (Itens atrelados à assinatura, ex. licença base + add-ons)
CREATE TABLE public.subscription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    price_id UUID NOT NULL REFERENCES public.prices(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subscription_items_subscription_id ON public.subscription_items(subscription_id);
CREATE INDEX idx_subscription_items_price_id ON public.subscription_items(price_id);
CREATE INDEX idx_subscription_items_metadata ON public.subscription_items USING GIN (metadata);

-- 8. Tabela: invoices (Faturas Emitidas)
CREATE TABLE public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    number TEXT UNIQUE, -- Número serial da NF
    status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'uncollectible', 'void')),
    currency TEXT NOT NULL DEFAULT 'brl',
    subtotal NUMERIC(15,4) NOT NULL DEFAULT 0.0000,
    tax NUMERIC(15,4) NOT NULL DEFAULT 0.0000,
    total NUMERIC(15,4) NOT NULL DEFAULT 0.0000,
    amount_due NUMERIC(15,4) NOT NULL DEFAULT 0.0000,
    amount_paid NUMERIC(15,4) NOT NULL DEFAULT 0.0000,
    amount_remaining NUMERIC(15,4) NOT NULL DEFAULT 0.0000,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    due_date TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invoices_tenant_id ON public.invoices(tenant_id);
CREATE INDEX idx_invoices_subscription_id ON public.invoices(subscription_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_metadata ON public.invoices USING GIN (metadata);

-- 9. Tabela: invoice_line_items (Linhas descritivas de cada fatura)
CREATE TABLE public.invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    price_id UUID REFERENCES public.prices(id) ON DELETE SET NULL,
    subscription_item_id UUID REFERENCES public.subscription_items(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    amount NUMERIC(15,4) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'brl',
    proration BOOLEAN NOT NULL DEFAULT false,
    quantity INTEGER NOT NULL DEFAULT 1,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invoice_line_items_invoice_id ON public.invoice_line_items(invoice_id);
CREATE INDEX idx_invoice_line_items_price_id ON public.invoice_line_items(price_id);
CREATE INDEX idx_invoice_line_items_metadata ON public.invoice_line_items USING GIN (metadata);

-- 10. Tabela: idempotency_keys (Proteção contra faturamento duplo)
CREATE TABLE public.idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    recovery_point TEXT,
    response_code INTEGER,
    response_body JSONB
);
CREATE INDEX idx_idempotency_keys_key ON public.idempotency_keys(key);

-- 11. Tabela: billing_events_log (Event Sourcing / Audit Trail Append-only)
CREATE TABLE public.billing_events_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- Ex: 'invoice.updated', 'subscription.created'
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    actor_id UUID, -- Usuário auth.uid() que causou o evento
    old_payload JSONB,
    new_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_billing_events_log_record_id ON public.billing_events_log(record_id);
CREATE INDEX idx_billing_events_log_event_type ON public.billing_events_log(event_type);
