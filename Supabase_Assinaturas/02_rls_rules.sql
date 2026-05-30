-- Habilitar Row-Level Security (RLS) nas tabelas do módulo de assinaturas

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

-- Políticas para a tabela plans
-- Assumimos que os planos são de visualização pública ou ao menos disponíveis para usuários logados.
CREATE POLICY "Planos são visíveis por todos os usuários autenticados"
ON public.plans FOR SELECT
TO authenticated
USING (true);

-- Políticas para a tabela plan_limits
CREATE POLICY "Limites de planos são visíveis por todos os usuários autenticados"
ON public.plan_limits FOR SELECT
TO authenticated
USING (true);

-- Políticas para a tabela subscriptions
-- O tenant_id utilizado como critério pode vir do custom claim ou do uid padrão da autenticação do Supabase.
CREATE POLICY "Tenant pode ver sua própria assinatura"
ON public.subscriptions FOR SELECT
TO authenticated
USING (tenant_id = COALESCE((auth.jwt()->>'tenant_id')::uuid, auth.uid()));

CREATE POLICY "Tenant pode atualizar sua própria assinatura"
ON public.subscriptions FOR UPDATE
TO authenticated
USING (tenant_id = COALESCE((auth.jwt()->>'tenant_id')::uuid, auth.uid()));

-- Políticas para a tabela usage_counters
CREATE POLICY "Tenant pode ver seus próprios contadores de uso"
ON public.usage_counters FOR SELECT
TO authenticated
USING (tenant_id = COALESCE((auth.jwt()->>'tenant_id')::uuid, auth.uid()));

CREATE POLICY "Tenant pode atualizar seus próprios contadores de uso"
ON public.usage_counters FOR UPDATE
TO authenticated
USING (tenant_id = COALESCE((auth.jwt()->>'tenant_id')::uuid, auth.uid()));
