import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { cobrancaLogger } from '../../infrastructure/logging/logger';

/**
 * CobrAI Rules Engine — motor de régua de cobrança por IA.
 *
 * FLUXO:
 * 1. Evento: fatura muda para status 'overdue' (detectado via Realtime)
 * 2. Rules Engine calcula quais ações devem ser executadas
 * 3. Cada ação é agendada como job no BullMQ com delay calculado
 * 4. Worker executa as ações nos momentos certos
 *
 * AÇÕES DISPONÍVEIS:
 * - send_message: enviar WhatsApp com template personalizado
 * - suspend_signal: chamar API de suspensão do roteador
 * - reactivate: reativar sinal após pagamento
 * - notify_human: notificar operador para ação manual
 */

export interface CobraiRule {
  id: string;
  name: string;
  daysOverdue: number;
  action: 'send_message' | 'suspend_signal' | 'reactivate' | 'notify_human';
  messageTemplate?: string;
  active: boolean;
}

export interface CobraiTriggerOptions {
  tenantId: string;
  customerId: string;
  invoiceId: string;
  amountCents: number;
  dueDate: Date;
  customerName?: string;
  customerPhone?: string;
}

/**
 * Busca as regras ativas de cobrança do tenant.
 */
export async function getTenantCobraiRules(tenantId: string): Promise<CobraiRule[]> {
  const { data, error } = await supabaseAdmin
    .from('cobrai_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('days_overdue', { ascending: true });

  if (error) {
    cobrancaLogger.error({ err: error, tenantId }, 'Erro ao buscar regras CobrAI');
    return [];
  }

  return (data ?? []).map(r => ({
    id: r.id,
    name: r.name,
    daysOverdue: r.days_overdue,
    action: r.action,
    messageTemplate: r.message_template,
    active: r.active,
  }));
}

/**
 * Interpola variáveis no template da mensagem.
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    String(vars[key] ?? `{{${key}}}`)
  );
}

/**
 * Calcula o delay em ms para executar uma ação baseada em dias de atraso.
 */
export function calculateActionDelay(
  dueDate: Date,
  daysOverdue: number
): number {
  const actionDate = new Date(dueDate);
  actionDate.setDate(actionDate.getDate() + daysOverdue);
  const now = new Date();
  const delayMs = actionDate.getTime() - now.getTime();
  return Math.max(0, delayMs); // nunca negativo
}

/**
 * Registra um job de cobrança no Supabase para auditoria.
 */
export async function registerCobraiJob(opts: {
  tenantId: string;
  customerId: string;
  invoiceId: string;
  ruleId: string;
  bullmqJobId: string;
  scheduledFor: Date;
}): Promise<void> {
  await supabaseAdmin.from('cobrai_jobs').insert({
    tenant_id: opts.tenantId,
    customer_id: opts.customerId,
    invoice_id: opts.invoiceId,
    rule_id: opts.ruleId,
    bullmq_job_id: opts.bullmqJobId,
    status: 'scheduled',
    scheduled_for: opts.scheduledFor.toISOString(),
  });
}

/**
 * Cancela todos os jobs pendentes de CobrAI para uma fatura.
 * Chamado quando o cliente paga.
 */
export async function cancelInvoiceCobraiJobs(
  tenantId: string,
  invoiceId: string
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('cobrai_jobs')
    .select('bullmq_job_id')
    .eq('tenant_id', tenantId)
    .eq('invoice_id', invoiceId)
    .eq('status', 'scheduled');

  const jobIds = (data ?? []).map(j => j.bullmq_job_id).filter(Boolean);

  if (jobIds.length > 0) {
    await supabaseAdmin
      .from('cobrai_jobs')
      .update({ status: 'cancelled' })
      .eq('invoice_id', invoiceId)
      .eq('tenant_id', tenantId)
      .eq('status', 'scheduled');

    cobrancaLogger.info(
      { tenantId, invoiceId, cancelledCount: jobIds.length },
      'Jobs CobrAI cancelados após pagamento'
    );
  }

  return jobIds;
}

/**
 * Cria as regras padrão de cobrança para um novo tenant.
 */
export async function createDefaultCobraiRules(tenantId: string): Promise<void> {
  const defaultRules = [
    {
      tenant_id: tenantId,
      name: 'Lembrete D+1',
      days_overdue: 1,
      action: 'send_message',
      message_template: 'Olá {{customerName}}! 👋 Sua fatura de R$ {{amountBRL}} venceu ontem. Pague agora e evite a suspensão do serviço: {{paymentLink}}',
      active: true,
    },
    {
      tenant_id: tenantId,
      name: 'Aviso D+5',
      days_overdue: 5,
      action: 'send_message',
      message_template: 'Atenção {{customerName}}, sua fatura está há 5 dias em aberto. Valor: R$ {{amountBRL}}. Para evitar a suspensão, regularize hoje: {{paymentLink}}',
      active: true,
    },
    {
      tenant_id: tenantId,
      name: 'Suspensão D+10',
      days_overdue: 10,
      action: 'suspend_signal',
      active: true,
    },
    {
      tenant_id: tenantId,
      name: 'Notificar Operador D+30',
      days_overdue: 30,
      action: 'notify_human',
      message_template: 'Cliente {{customerName}} com {{daysOverdue}} dias de inadimplência.',
      active: true,
    },
  ];

  await supabaseAdmin.from('cobrai_rules').insert(defaultRules);
  cobrancaLogger.info({ tenantId, count: defaultRules.length }, 'Regras CobrAI padrão criadas');
}
