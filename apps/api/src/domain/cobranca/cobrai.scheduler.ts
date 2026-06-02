import { cobrancaQueue } from '../../../../../packages/queue/src/queues';
import {
  getTenantCobraiRules,
  calculateActionDelay,
  registerCobraiJob,
  interpolateTemplate,
  type CobraiTriggerOptions,
} from './cobrai-rules.service';
import { cobrancaLogger } from '../../infrastructure/logging/logger';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

/**
 * CobrAI Scheduler — agenda todos os jobs de cobrança quando uma fatura vence.
 * Chamado pelo listener de Realtime quando invoice.status → 'overdue'.
 */
export async function scheduleCobraiFlow(opts: CobraiTriggerOptions): Promise<void> {
  const { tenantId, customerId, invoiceId, amountCents, dueDate } = opts;

  cobrancaLogger.info(
    { tenantId, invoiceId, amountCents },
    'Iniciando agendamento da régua CobrAI'
  );

  // Buscar regras do tenant
  const rules = await getTenantCobraiRules(tenantId);

  if (rules.length === 0) {
    cobrancaLogger.warn({ tenantId }, 'Nenhuma regra CobrAI ativa — cobrança não agendada');
    return;
  }

  // Buscar dados do cliente para templates
  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('name, phone')
    .eq('id', customerId)
    .single();

  const amountBRL = (amountCents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
  });

  const templateVars = {
    customerName: customer?.name ?? 'Cliente',
    amountBRL,
    amountCents,
    daysOverdue: 0, // será substituído por cada regra
    paymentLink: `https://pagar.astrum.com.br/${invoiceId}`,
    invoiceId,
  };

  // Agendar job para cada regra
  for (const rule of rules) {
    const delayMs = calculateActionDelay(new Date(dueDate), rule.daysOverdue);
    const scheduledFor = new Date(Date.now() + delayMs);

    const jobData = {
      tenantId,
      customerId,
      invoiceId,
      ruleId: rule.id,
      action: rule.action,
      customerPhone: customer?.phone,
      messageContent: rule.messageTemplate
        ? interpolateTemplate(rule.messageTemplate, {
            ...templateVars,
            daysOverdue: rule.daysOverdue,
          })
        : undefined,
    };

    const job = await cobrancaQueue.add(
      `cobrai:${rule.action}:${invoiceId}`,
      jobData,
      {
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: `cobrai:${invoiceId}:${rule.id}`, // jobId único evita duplicatas
      }
    );

    // Registrar no banco para auditoria
    await registerCobraiJob({
      tenantId,
      customerId,
      invoiceId,
      ruleId: rule.id,
      bullmqJobId: job.id ?? '',
      scheduledFor,
    });

    cobrancaLogger.info(
      {
        tenantId,
        invoiceId,
        ruleId: rule.id,
        action: rule.action,
        daysOverdue: rule.daysOverdue,
        delayMs,
        scheduledFor: scheduledFor.toISOString(),
      },
      `CobrAI job agendado: ${rule.action} em ${rule.daysOverdue} dias`
    );
  }

  cobrancaLogger.info(
    { tenantId, invoiceId, jobsScheduled: rules.length },
    '✅ Régua CobrAI completa agendada'
  );
}
