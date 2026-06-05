import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

/**
 * Planos SaaS da Astrum — limites por tier.
 *
 * starter:    ISPs pequenos, até 500 clientes
 * pro:        ISPs médios, até 5.000 clientes
 * enterprise: ISPs grandes, sem limites
 */

export type AstrumPlan = 'starter' | 'pro' | 'enterprise';

export interface PlanLimits {
  maxCustomers: number;
  maxOperators: number;
  maxDocuments: number;         // documentos RAG
  maxMessagesPerMonth: number;  // mensagens IA processadas
  ragEnabled: boolean;
  cobraiEnabled: boolean;
  analyticsEnabled: boolean;
  streamingEnabled: boolean;
  prioritySupport: boolean;
  priceCentsPerMonth: number;
}

export const PLAN_LIMITS: Record<AstrumPlan, PlanLimits> = {
  starter: {
    maxCustomers: 500,
    maxOperators: 2,
    maxDocuments: 5,
    maxMessagesPerMonth: 1000,
    ragEnabled: false,
    cobraiEnabled: true,
    analyticsEnabled: false,
    streamingEnabled: false,
    prioritySupport: false,
    priceCentsPerMonth: 29700,   // R$ 297,00/mês
  },
  pro: {
    maxCustomers: 5000,
    maxOperators: 10,
    maxDocuments: 50,
    maxMessagesPerMonth: 10000,
    ragEnabled: true,
    cobraiEnabled: true,
    analyticsEnabled: true,
    streamingEnabled: true,
    prioritySupport: false,
    priceCentsPerMonth: 79700,   // R$ 797,00/mês
  },
  enterprise: {
    maxCustomers: Infinity,
    maxOperators: Infinity,
    maxDocuments: Infinity,
    maxMessagesPerMonth: Infinity,
    ragEnabled: true,
    cobraiEnabled: true,
    analyticsEnabled: true,
    streamingEnabled: true,
    prioritySupport: true,
    priceCentsPerMonth: 0,       // negociado diretamente
  },
};

/**
 * Busca os limites do plano de um tenant.
 */
export async function getTenantPlanLimits(tenantId: string): Promise<PlanLimits> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single();

  const plan = (data?.plan ?? 'starter') as AstrumPlan;
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.starter;
}

/**
 * Verifica se o tenant pode realizar uma ação com base no plano.
 */
export async function checkPlanLimit(
  tenantId: string,
  resource: 'customers' | 'operators' | 'documents' | 'messages',
): Promise<{ allowed: boolean; current: number; limit: number; plan: AstrumPlan }> {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single();

  const plan = (tenant?.plan ?? 'starter') as AstrumPlan;
  const limits = PLAN_LIMITS[plan];

  const countMap: Record<string, { table: string; maxField: keyof PlanLimits }> = {
    customers: { table: 'customers', maxField: 'maxCustomers' },
    operators: { table: 'users', maxField: 'maxOperators' },
    documents: { table: 'knowledge_documents', maxField: 'maxDocuments' },
    messages: { table: 'messages', maxField: 'maxMessagesPerMonth' },
  };

  const { table, maxField } = countMap[resource];

  const query = supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  // Para mensagens: contar apenas do mês atual
  if (resource === 'messages') {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    query.gte('created_at', firstOfMonth.toISOString());
  }

  const { count } = await query;

  const current = count ?? 0;
  const limit = limits[maxField] as number;
  const allowed = current < limit;

  if (!allowed) {
    infraLogger.warn(
      { tenantId, resource, current, limit, plan },
      `Limite de plano atingido: ${resource}`
    );
  }

  return { allowed, current, limit, plan };
}

/**
 * Middleware Fastify que verifica limite do plano antes de criar recursos.
 */
export function requirePlanCapacity(resource: 'customers' | 'operators' | 'documents' | 'messages') {
  return async (request: any, reply: any) => {
    const { tenantId } = request.user ?? {};
    if (!tenantId) return;

    const check = await checkPlanLimit(tenantId, resource);

    if (!check.allowed) {
      const limitBRL = (PLAN_LIMITS[check.plan].priceCentsPerMonth / 100).toLocaleString('pt-BR', {
        style: 'currency', currency: 'BRL',
      });

      return reply.status(402).send({
        code: 'PLAN_LIMIT_REACHED',
        message: `Limite do plano ${check.plan} atingido para ${resource}: ${check.current}/${check.limit}.`,
        upgrade_hint: `Faça upgrade para o plano Pro ou Enterprise para aumentar seus limites.`,
        current_plan: check.plan,
        current_usage: check.current,
        limit: check.limit,
      });
    }
  };
}
