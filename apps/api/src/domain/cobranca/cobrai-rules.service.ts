import type { ICobrancaDbPort, CobraiRule, CobraiTriggerOptions, IRegisterCobraiJobInput } from '../ports/cobranca.port';
import type { ILoggerPort } from '../ports/logger.port';

// Re-export types so existing callers don't break
export type { CobraiRule, CobraiTriggerOptions };

/**
 * CobrAI Rules Engine — motor de régua de cobrança por IA.
 *
 * FLUXO:
 * 1. Evento: fatura muda para status 'overdue' (detectado via Realtime)
 * 2. Rules Engine calcula quais ações devem ser executadas
 * 3. Cada ação é agendada como job no BullMQ com delay calculado
 * 4. Worker executa as ações nos momentos certos
 */

/**
 * Interpola variáveis no template da mensagem.
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    String(vars[key] ?? `{{${key}}}`),
  );
}

/**
 * Calcula o delay em ms para executar uma ação baseada em dias de atraso.
 */
export function calculateActionDelay(
  dueDate: Date,
  daysOverdue: number,
): number {
  const actionDate = new Date(dueDate);
  actionDate.setDate(actionDate.getDate() + daysOverdue);
  const now = new Date();
  const delayMs = actionDate.getTime() - now.getTime();
  return Math.max(0, delayMs);
}

export interface ICobrancaRulesService {
  getTenantCobraiRules(tenantId: string): Promise<CobraiRule[]>;
  registerCobraiJob(opts: IRegisterCobraiJobInput): Promise<void>;
  cancelInvoiceCobraiJobs(tenantId: string, invoiceId: string): Promise<string[]>;
  createDefaultCobraiRules(tenantId: string): Promise<void>;
}

export function makeCobrancaRulesService(deps: { db: ICobrancaDbPort; logger: ILoggerPort }): ICobrancaRulesService {
  const { db, logger } = deps;

  async function getTenantCobraiRules(tenantId: string): Promise<CobraiRule[]> {
    try {
      return await db.getTenantCobraiRules(tenantId);
    } catch (err) {
      logger.error({ err, tenantId }, 'Erro ao buscar regras CobrAI');
      return [];
    }
  }

  async function registerCobraiJob(opts: IRegisterCobraiJobInput): Promise<void> {
    await db.registerCobraiJob(opts);
  }

  async function cancelInvoiceCobraiJobs(tenantId: string, invoiceId: string): Promise<string[]> {
    const jobIds = await db.cancelInvoiceCobraiJobs(tenantId, invoiceId);
    if (jobIds.length > 0) {
      logger.info(
        { tenantId, invoiceId, cancelledCount: jobIds.length },
        'Jobs CobrAI cancelados após pagamento',
      );
    }
    return jobIds;
  }

  async function createDefaultCobraiRules(tenantId: string): Promise<void> {
    await db.createDefaultCobraiRules(tenantId);
    logger.info({ tenantId }, 'Regras CobrAI padrão criadas');
  }

  return { getTenantCobraiRules, registerCobraiJob, cancelInvoiceCobraiJobs, createDefaultCobraiRules };
}
