/**
 * Dossiê #21 — Prevenção de Fraude em Chargeback.
 * Detecta padrões suspeitos de chargeback e bloqueia automaticamente
 * clientes com histórico de disputas recorrentes.
 */

export interface ChargebackEvent {
  id: string;
  customerId: string;
  invoiceId: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface ChargebackRiskProfile {
  customerId: string;
  totalChargebacks: number;
  totalAmount: number;
  last90DaysCount: number;
  riskLevel: 'low' | 'medium' | 'high' | 'blocked';
}

export interface ChargebackConfig {
  blockThreshold: number;
  warnThreshold: number;
  windowDays: number;
}

export const DEFAULT_CHARGEBACK_CONFIG: ChargebackConfig = {
  blockThreshold: 3,
  warnThreshold: 2,
  windowDays: 90,
};

export interface ChargebackPorts {
  getChargebacks: (tenantId: string, customerId: string, since: string) => Promise<ChargebackEvent[]>;
  getAllChargebacks: (tenantId: string, customerId: string) => Promise<ChargebackEvent[]>;
  blockCustomer: (tenantId: string, customerId: string, reason: string) => Promise<void>;
  sendWarning: (tenantId: string, customerId: string, count: number) => Promise<void>;
}

export function assessRisk(
  recentCount: number,
  totalCount: number,
  cfg: ChargebackConfig = DEFAULT_CHARGEBACK_CONFIG,
): ChargebackRiskProfile['riskLevel'] {
  if (recentCount >= cfg.blockThreshold) return 'blocked';
  if (recentCount >= cfg.warnThreshold) return 'high';
  if (totalCount > 0) return 'medium';
  return 'low';
}

export async function evaluateCustomer(
  tenantId: string,
  customerId: string,
  ports: ChargebackPorts,
  cfg: ChargebackConfig = DEFAULT_CHARGEBACK_CONFIG,
  now: Date = new Date(),
): Promise<ChargebackRiskProfile> {
  const sinceDate = new Date(now);
  sinceDate.setDate(sinceDate.getDate() - cfg.windowDays);
  const since = sinceDate.toISOString().slice(0, 10);

  const [recent, all] = await Promise.all([
    ports.getChargebacks(tenantId, customerId, since),
    ports.getAllChargebacks(tenantId, customerId),
  ]);

  const riskLevel = assessRisk(recent.length, all.length, cfg);
  const totalAmount = all.reduce((s, c) => s + c.amount, 0);

  if (riskLevel === 'blocked') {
    await ports.blockCustomer(tenantId, customerId, `Chargeback recorrente: ${recent.length} em ${cfg.windowDays} dias`);
  } else if (riskLevel === 'high') {
    await ports.sendWarning(tenantId, customerId, recent.length);
  }

  return { customerId, totalChargebacks: all.length, totalAmount, last90DaysCount: recent.length, riskLevel };
}
