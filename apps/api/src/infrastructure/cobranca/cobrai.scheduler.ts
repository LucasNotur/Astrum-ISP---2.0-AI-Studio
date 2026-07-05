import { cobrancaQueue } from '../../../../../packages/queue/src/queues';
import {
  calculateActionDelay,
  interpolateTemplate,
  type CobraiTriggerOptions,
} from '../../domain/cobranca/cobrai-rules.service';
import { getTenantCobraiRules, registerCobraiJob } from '../adapters/cobranca-db.adapter';
import { cobrancaLogger } from '../logging/logger';
import { supabaseAdmin } from '../database/supabase.client';

/**
 * CobrAI Scheduler — agenda todos os jobs de cobrança quando uma fatura vence.
 * Chamado pelo listener de Realtime quando invoice.status → 'overdue'.
 */
export async function scheduleCobraiFlow(opts: CobraiTriggerOptions): Promise<void> {
  const { tenantId, customerId, invoiceId, amountCents, dueDate } = opts;

  cobrancaLogger.info(
    { tenantId, invoiceId, amountCents },
    'Iniciando agendamento da régua CobrAI',
  );

  const rules = await getTenantCobraiRules(tenantId);

  if (rules.length === 0) {
    cobrancaLogger.warn({ tenantId }, 'Nenhuma regra CobrAI ativa — cobrança não agendada');
    return;
  }

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
    daysOverdue: 0,
    paymentLink: `https://pagar.astrum.com.br/${invoiceId}`,
    invoiceId,
  };

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
        jobId: `cobrai:${invoiceId}:${rule.id}`,
      },
    );

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
      `CobrAI job agendado: ${rule.action} em ${rule.daysOverdue} dias`,
    );
  }

  cobrancaLogger.info(
    { tenantId, invoiceId, jobsScheduled: rules.length },
    '✅ Régua CobrAI completa agendada',
  );
}
