-- Políticas RLS (Row-Level Security) Avançadas

-- Habilita RLS em todas as tabelas de faturamento e catálogo
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

-- As configurações do plano constituem o catálogo de assinaturas.
-- Todo usuário autenticado tem permissão de visualizar o catálogo (plans, quotas, features, tiers).
CREATE POLICY "Visualização de planos habilitada a todos autenticados"
ON public.plans FOR SELECT TO authenticated USING (true);

CREATE POLICY "Visualização de relacao features/planos para todos autenticados"
ON public.plan_features FOR SELECT TO authenticated USING (true);

CREATE POLICY "Visualização de cotas/planos para todos autenticados"
ON public.plan_quotas FOR SELECT TO authenticated USING (true);

CREATE POLICY "Visualização de tiers/planos para todos autenticados"
ON public.pricing_tiers FOR SELECT TO authenticated USING (true);


-- Segurança para tenant (isolamento rígido por JWT ou supabase auth.uid())
-- Provedores apenas podem alterar ou ler dados referentes aos seus próprios Ids (tenant_id).

CREATE POLICY "Provedor vê somente suas assinaturas"
ON public.subscriptions FOR SELECT TO authenticated
USING (tenant_id = COALESCE((auth.jwt()->>'tenant_id')::uuid, auth.uid()));

CREATE POLICY "Provedor gerencia sua própria assinatura"
ON public.subscriptions FOR ALL TO authenticated
USING (tenant_id = COALESCE((auth.jwt()->>'tenant_id')::uuid, auth.uid()))
WITH CHECK (tenant_id = COALESCE((auth.jwt()->>'tenant_id')::uuid, auth.uid()));

CREATE POLICY "Provedor visualiza somente seu consumo corrente"
ON public.usage_counters FOR SELECT TO authenticated
USING (tenant_id = COALESCE((auth.jwt()->>'tenant_id')::uuid, auth.uid()));

CREATE POLICY "Provedor controla contadores com base em sua identidade"
ON public.usage_counters FOR ALL TO authenticated
USING (tenant_id = COALESCE((auth.jwt()->>'tenant_id')::uuid, auth.uid()))
WITH CHECK (tenant_id = COALESCE((auth.jwt()->>'tenant_id')::uuid, auth.uid()));
