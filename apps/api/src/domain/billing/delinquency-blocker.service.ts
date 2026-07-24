/**
 * Dossiê #27 — Bloqueador Global por Inadimplência.
 * Bloqueia serviço (conexão PPPoE/RADIUS) de assinantes com faturas
 * vencidas acima do threshold configurável (default: 2 faturas OU 30 dias).
 * Integra com ERP via write-back e envia notificação antes do corte.
 */

export interface DelinquencyConfig {
  maxOverdueInvoices: number;
  maxOverdueDays: number;
  gracePeriodDays: number;
  notifyBeforeBlockDays: number;
}

export const DEFAULT_CONFIG: DelinquencyConfig = {
  maxOverdueInvoices: 2,
  maxOverdueDays: 30,
  gracePeriodDays: 3,
  notifyBeforeBlockDays: 2,
};

export interface CustomerDelinquency {
  customerId: string;
  customerName: string;
  overdueCount: number;
  oldestOverdueDays: number;
  totalOverdue: number;
}

export type BlockAction = 'notify' | 'block' | 'already_blocked' | 'within_grace';

export interface BlockDecision {
  customerId: string;
  action: BlockAction;
  reason: string;
}

export interface DelinquencyPorts {
  getOverdueCustomers: (tenantId: string) => Promise<CustomerDelinquency[]>;
  isBlocked: (tenantId: string, customerId: string) => Promise<boolean>;
  blockService: (tenantId: string, customerId: string, reason: string) => Promise<void>;
  sendBlockWarning: (tenantId: string, customerId: string, daysUntilBlock: number) => Promise<void>;
  getConfig: (tenantId: string) => Promise<DelinquencyConfig | null>;
}

export function evaluateDelinquency(
  c: CustomerDelinquency,
  cfg: DelinquencyConfig,
): { shouldBlock: boolean; inGrace: boolean; shouldNotify: boolean } {
  const exceedsInvoices = c.overdueCount >= cfg.maxOverdueInvoices;
  const exceedsDays = c.oldestOverdueDays >= cfg.maxOverdueDays;
  const trigger = exceedsInvoices || exceedsDays;

  const shouldNotify = c.oldestOverdueDays >= (cfg.maxOverdueDays - cfg.notifyBeforeBlockDays)
    || c.overdueCount >= cfg.maxOverdueInvoices - 1;

  if (!trigger) return { shouldBlock: false, inGrace: false, shouldNotify };

  const daysOverThreshold = c.oldestOverdueDays - cfg.maxOverdueDays;
  const inGrace = daysOverThreshold >= 0 && daysOverThreshold < cfg.gracePeriodDays;

  return { shouldBlock: trigger && !inGrace, inGrace, shouldNotify };
}

export async function processDelinquencies(
  tenantId: string,
  ports: DelinquencyPorts,
): Promise<BlockDecision[]> {
  const cfg = (await ports.getConfig(tenantId)) ?? DEFAULT_CONFIG;
  const customers = await ports.getOverdueCustomers(tenantId);
  const decisions: BlockDecision[] = [];

  for (const c of customers) {
    const already = await ports.isBlocked(tenantId, c.customerId);
    if (already) {
      decisions.push({ customerId: c.customerId, action: 'already_blocked', reason: 'Serviço já bloqueado' });
      continue;
    }

    const { shouldBlock, inGrace, shouldNotify } = evaluateDelinquency(c, cfg);

    if (!shouldBlock && !shouldNotify) continue;

    if (inGrace || (!shouldBlock && shouldNotify)) {
      const daysUntilBlock = cfg.maxOverdueDays + cfg.gracePeriodDays - c.oldestOverdueDays;
      await ports.sendBlockWarning(tenantId, c.customerId, Math.max(0, daysUntilBlock));
      decisions.push({
        customerId: c.customerId,
        action: shouldNotify && !shouldBlock ? 'notify' : 'within_grace',
        reason: `Aviso: bloqueio em ${daysUntilBlock} dias (${c.overdueCount} faturas vencidas, R$${c.totalOverdue.toFixed(2)})`,
      });
      continue;
    }

    const reason = `Bloqueio por inadimplência: ${c.overdueCount} faturas vencidas há ${c.oldestOverdueDays} dias (R$${c.totalOverdue.toFixed(2)})`;
    await ports.blockService(tenantId, c.customerId, reason);
    decisions.push({ customerId: c.customerId, action: 'block', reason });
  }

  return decisions;
}
