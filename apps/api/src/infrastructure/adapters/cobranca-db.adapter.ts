import { supabaseAdmin } from '../database/supabase.client';
import { cobrancaLogger } from '../logging/logger';
import type { ICobrancaDbPort, CobraiRule, IRegisterCobraiJobInput } from '../../domain/ports/cobranca.port';
import { makeCobrancaRulesService } from '../../domain/cobranca/cobrai-rules.service';

const cobrancaDbAdapter: ICobrancaDbPort = {
  async getTenantCobraiRules(tenantId: string): Promise<CobraiRule[]> {
    const { data, error } = await supabaseAdmin
      .from('cobrai_rules')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .order('days_overdue', { ascending: true });

    if (error) throw error;

    return (data ?? []).map(r => ({
      id: r.id,
      name: r.name,
      daysOverdue: r.days_overdue,
      action: r.action,
      messageTemplate: r.message_template,
      active: r.active,
    }));
  },

  async registerCobraiJob(opts: IRegisterCobraiJobInput): Promise<void> {
    await supabaseAdmin.from('cobrai_jobs').insert({
      tenant_id: opts.tenantId,
      customer_id: opts.customerId,
      invoice_id: opts.invoiceId,
      rule_id: opts.ruleId,
      bullmq_job_id: opts.bullmqJobId,
      status: 'scheduled',
      scheduled_for: opts.scheduledFor.toISOString(),
    });
  },

  async cancelInvoiceCobraiJobs(tenantId: string, invoiceId: string): Promise<string[]> {
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
    }

    return jobIds;
  },

  async createDefaultCobraiRules(tenantId: string): Promise<void> {
    const defaultRules = [
      {
        tenant_id: tenantId,
        name: 'Lembrete D+1',
        days_overdue: 1,
        action: 'send_message',
        message_template:
          'Olá {{customerName}}! 👋 Sua fatura de R$ {{amountBRL}} venceu ontem. Pague agora e evite a suspensão do serviço: {{paymentLink}}',
        active: true,
      },
      {
        tenant_id: tenantId,
        name: 'Aviso D+5',
        days_overdue: 5,
        action: 'send_message',
        message_template:
          'Atenção {{customerName}}, sua fatura está há 5 dias em aberto. Valor: R$ {{amountBRL}}. Para evitar a suspensão, regularize hoje: {{paymentLink}}',
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
  },
};

// Pré-wired singleton — importar daqui em vez do service para obter as funções com DB real
export const cobrancaRulesService = makeCobrancaRulesService({
  db: cobrancaDbAdapter,
  logger: cobrancaLogger,
});

export const {
  getTenantCobraiRules,
  registerCobraiJob,
  cancelInvoiceCobraiJobs,
  createDefaultCobraiRules,
} = cobrancaRulesService;
