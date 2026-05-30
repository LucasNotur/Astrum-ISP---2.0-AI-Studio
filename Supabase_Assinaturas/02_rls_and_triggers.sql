-- Configuração de RLS, Políticas Transacionais e Triggers de Event Sourcing

-- 1. Habilitar RLS nas tabelas locatárias (Tenant-Bound)
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

-- Tabelas Globais (Catálogo) deixamos públicas leitura para autenticados
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catálogo Global - Autenticados" ON public.products FOR SELECT TO authenticated USING (active = true);
CREATE POLICY "Catálogo Global - Autenticados" ON public.prices FOR SELECT TO authenticated USING (active = true);
CREATE POLICY "Catálogo Global - Autenticados" ON public.price_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Catálogo Global - Autenticados" ON public.coupons FOR SELECT TO authenticated USING (valid = true);

-- Políticas RLS pautadas no Isolation do Tenant JWT Claim (ou uid)
-- Regra de uso: auth.jwt()->>'tenant_id' ou auth.uid()
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(current_setting('request.jwt.claim.tenant_id', true), ''),
    auth.uid()::text
  )::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Subscriptions
CREATE POLICY "Tenant view own subscriptions" ON public.subscriptions FOR SELECT TO authenticated 
USING (tenant_id = current_tenant_id());

CREATE POLICY "Tenant manage own subscriptions" ON public.subscriptions FOR ALL TO authenticated 
USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

-- Subscription Items
CREATE POLICY "Tenant view own subscription items" ON public.subscription_items FOR SELECT TO authenticated 
USING (subscription_id IN (SELECT id FROM public.subscriptions WHERE tenant_id = current_tenant_id()));

-- Discounts
CREATE POLICY "Tenant view own discounts" ON public.discounts FOR SELECT TO authenticated 
USING (tenant_id = current_tenant_id());

-- Invoices
CREATE POLICY "Tenant view own invoices" ON public.invoices FOR SELECT TO authenticated 
USING (tenant_id = current_tenant_id());

-- Invoice Line Items
CREATE POLICY "Tenant view own invoice lines" ON public.invoice_line_items FOR SELECT TO authenticated 
USING (invoice_id IN (SELECT id FROM public.invoices WHERE tenant_id = current_tenant_id()));


-- 2. Trigger Function: Event Sourcing / Audit Log
CREATE OR REPLACE FUNCTION audit_billing_events()
RETURNS trigger AS $$
DECLARE
    v_actor_id UUID;
BEGIN
    -- Capturar ator da sessão se estiver no Supabase auth
    BEGIN
        v_actor_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_actor_id := NULL;
    END;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.billing_events_log(event_type, table_name, record_id, actor_id, new_payload)
        VALUES (TG_TABLE_NAME || '.created', TG_TABLE_NAME, NEW.id, v_actor_id, row_to_json(NEW)::jsonb);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.billing_events_log(event_type, table_name, record_id, actor_id, old_payload, new_payload)
        VALUES (TG_TABLE_NAME || '.updated', TG_TABLE_NAME, NEW.id, v_actor_id, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.billing_events_log(event_type, table_name, record_id, actor_id, old_payload)
        VALUES (TG_TABLE_NAME || '.deleted', TG_TABLE_NAME, OLD.id, v_actor_id, row_to_json(OLD)::jsonb);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atrelar Triggers (Audit Log) às tabelas financeiras críiticas
CREATE TRIGGER trg_audit_subscriptions
AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION audit_billing_events();

CREATE TRIGGER trg_audit_invoices
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION audit_billing_events();

CREATE TRIGGER trg_audit_discounts
AFTER INSERT OR UPDATE OR DELETE ON public.discounts
FOR EACH ROW EXECUTE FUNCTION audit_billing_events();


-- 3. Trigger Function: Prevenir Hard Delete (Exclusão Física) de Faturas Emitidas
CREATE OR REPLACE FUNCTION prevent_invoice_deletion()
RETURNS trigger AS $$
BEGIN
    IF OLD.status IN ('open', 'paid', 'uncollectible', 'void') AND OLD.status != 'draft' THEN
        RAISE EXCEPTION 'Não é permitido excluir fisicamente uma fatura já emitida (Status: %). Utilize o estorno ou anulação (void).', OLD.status;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_invoice_delete
BEFORE DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION prevent_invoice_deletion();
