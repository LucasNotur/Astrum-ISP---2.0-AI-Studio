import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import type { ChurnFeatures } from './churn-score';

/**
 * IA-07 — Churn Features Service.
 *
 * Extrai features por cliente ativo diretamente do Supabase.
 * Cada feature é uma query independente para simplicidade; pode ser
 * otimizada em fase 2 com uma única query agregada.
 */

export interface ChurnFeaturesInput {
  tenantId: string;
  customerId: string;
}

/**
 * Calcula o tenure em dias desde a criação do customer.
 */
async function getTenureDays(tenantId: string, customerId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('customers')
    .select('created_at')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!data?.created_at) return 0;
  return Math.floor((Date.now() - new Date(data.created_at).getTime()) / 86_400_000);
}

/**
 * Conta faturas com status 'overdue' nos últimos 90 dias.
 */
async function getOverdueCount90d(tenantId: string, customerId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { count, error } = await supabaseAdmin
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('tenant_id', tenantId)
    .eq('status', 'overdue')
    .gte('due_date', cutoff);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Atraso médio de pagamento (em dias) nos últimos 180 dias.
 */
async function getAvgPaymentDelay180d(tenantId: string, customerId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const { data } = await supabaseAdmin
    .from('invoices')
    .select('due_date, paid_at')
    .eq('customer_id', customerId)
    .eq('tenant_id', tenantId)
    .eq('status', 'paid')
    .gte('due_date', cutoff);

  if (!data || data.length === 0) return 0;

  let totalDelay = 0;
  let count = 0;
  for (const inv of data) {
    if (inv.paid_at) {
      const delay = (new Date(inv.paid_at).getTime() - new Date(inv.due_date).getTime()) / 86_400_000;
      if (delay > 0) {
        totalDelay += delay;
        count++;
      }
    }
  }

  return count > 0 ? totalDelay / count : 0;
}

/**
 * Conta tickets nos últimos N dias.
 */
async function getTicketCount(tenantId: string, customerId: string, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const { count, error } = await supabaseAdmin
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('tenant_id', tenantId)
    .gte('created_at', cutoff);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Proporção de mensagens com sentimento negativo nos últimos 90 dias.
 * Usa `ai_performance_logs.sentiment` se disponível, senão retorna 0.
 */
async function getNegativeSentimentRatio90d(tenantId: string, customerId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();

  // Contar total de mensagens do customer no período
  const { count: totalCount } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', cutoff)
    .eq('role', 'user');

  if (!totalCount || totalCount === 0) return 0;

  // Contar mensagens com sentimento negativo via ai_performance_logs
  // Como os logs são por ticket, usamos LEFT JOIN conceitual
  const { data: tickets } = await supabaseAdmin
    .from('tickets')
    .select('id')
    .eq('customer_id', customerId)
    .eq('tenant_id', tenantId)
    .gte('created_at', cutoff);

  if (!tickets || tickets.length === 0) return 0;

  const ticketIds = tickets.map(t => t.id);
  const { count: negativeCount } = await supabaseAdmin
    .from('ai_performance_logs')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .in('ticket_id', ticketIds)
    .in('sentiment', ['negative', 'frustrated']);

  return negativeCount ? negativeCount / totalCount : 0;
}

/**
 * Conta downgrades nos últimos 180 dias.
 * Um downgrade é detectado comparando plan_id atual com anterior via billing.
 * Simplificado: conta alterações de plano que reduziram o valor.
 */
async function getDowngrades180d(tenantId: string, customerId: string): Promise<number> {
  // Verificar se o plano atual é menor que planos anteriores
  // Abordagem simplificada: verificar se há billing_plans com price decrescente
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('plan_id')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!customer?.plan_id) return 0;

  // TODO fase 2: usar tabela de histórico de planos (plan_change_log)
  // Por ora, 0 para todos os clientes
  return 0;
}

/**
 * Extrai todas as features de churn para um cliente.
 */
export async function extractFeatures(tenantId: string, customerId: string): Promise<ChurnFeatures> {
  const [tenureDays, overdueCount90d, avgPaymentDelayDays180d, tickets30d, tickets90d, negativeSentimentRatio90d, downgrades180d] =
    await Promise.all([
      getTenureDays(tenantId, customerId),
      getOverdueCount90d(tenantId, customerId),
      getAvgPaymentDelay180d(tenantId, customerId),
      getTicketCount(tenantId, customerId, 30),
      getTicketCount(tenantId, customerId, 90),
      getNegativeSentimentRatio90d(tenantId, customerId),
      getDowngrades180d(tenantId, customerId),
    ]);

  // MRR: buscar do billing_plans ativo do customer
  const { data: billing } = await supabaseAdmin
    .from('customers')
    .select('plan_id')
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  let mrrCents = 0;
  if (billing?.plan_id) {
    const { data: plan } = await supabaseAdmin
      .from('billing_plans')
      .select('price_cents')
      .eq('id', billing.plan_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    mrrCents = plan?.price_cents ?? 0;
  }

  return {
    tenureDays,
    overdueCount90d,
    avgPaymentDelayDays180d,
    tickets30d,
    tickets90d,
    negativeSentimentRatio90d,
    downgrades180d,
    mrrCents,
  };
}

/**
 * Busca todos os customers ativos de um tenant.
 */
export async function getActiveCustomers(tenantId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (error || !data) return [];
  return data;
}
