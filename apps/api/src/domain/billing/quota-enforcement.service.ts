/**
 * Dossiê #16 — Controle de Quotas de Mensagens (hard enforcement).
 * Item #16 estava parcial (tracking/alerting). Agora com enforcement
 * que bloqueia envio quando quota é excedida.
 */

export interface QuotaConfig {
  tenantId: string;
  plan: string;
  monthlyMessageLimit: number;
  monthlyTokenLimit: number;
  monthlyStorageLimitMb: number;
  overageAllowed: boolean;
  overagePricePerMessage?: number;
  overagePricePerToken?: number;
}

export interface QuotaUsage {
  tenantId: string;
  period: string;
  messagesUsed: number;
  tokensUsed: number;
  storageMb: number;
}

export interface QuotaPorts {
  getConfig: (tenantId: string) => Promise<QuotaConfig | null>;
  getUsage: (tenantId: string, period: string) => Promise<QuotaUsage>;
  incrementUsage: (tenantId: string, period: string, messages: number, tokens: number) => Promise<QuotaUsage>;
  notifyQuotaWarning: (tenantId: string, resource: string, percentUsed: number) => Promise<void>;
  notifyQuotaExceeded: (tenantId: string, resource: string) => Promise<void>;
}

export function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function quotaPercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.round((used / limit) * 1000) / 10;
}

export function isOverQuota(used: number, limit: number): boolean {
  return used >= limit;
}

export interface QuotaCheckResult {
  allowed: boolean;
  resource?: string;
  percentUsed?: number;
  overageCharge?: number;
  error?: string;
}

export async function checkAndConsumeQuota(
  tenantId: string,
  messageCount: number,
  tokenCount: number,
  ports: QuotaPorts,
): Promise<QuotaCheckResult> {
  const config = await ports.getConfig(tenantId);
  if (!config) return { allowed: false, error: 'Configuração de quota não encontrada' };

  const period = getCurrentPeriod();
  const usage = await ports.getUsage(tenantId, period);

  const msgPercent = quotaPercent(usage.messagesUsed, config.monthlyMessageLimit);
  const tokenPercent = quotaPercent(usage.tokensUsed, config.monthlyTokenLimit);

  if (isOverQuota(usage.messagesUsed + messageCount, config.monthlyMessageLimit)) {
    if (!config.overageAllowed) {
      await ports.notifyQuotaExceeded(tenantId, 'messages');
      return { allowed: false, resource: 'messages', percentUsed: msgPercent, error: 'Quota de mensagens excedida' };
    }
    const overageCharge = (config.overagePricePerMessage ?? 0) * messageCount;
    await ports.incrementUsage(tenantId, period, messageCount, tokenCount);
    return { allowed: true, resource: 'messages', percentUsed: msgPercent, overageCharge };
  }

  if (isOverQuota(usage.tokensUsed + tokenCount, config.monthlyTokenLimit)) {
    if (!config.overageAllowed) {
      await ports.notifyQuotaExceeded(tenantId, 'tokens');
      return { allowed: false, resource: 'tokens', percentUsed: tokenPercent, error: 'Quota de tokens excedida' };
    }
    const overageCharge = (config.overagePricePerToken ?? 0) * tokenCount;
    await ports.incrementUsage(tenantId, period, messageCount, tokenCount);
    return { allowed: true, resource: 'tokens', percentUsed: tokenPercent, overageCharge };
  }

  await ports.incrementUsage(tenantId, period, messageCount, tokenCount);

  if (msgPercent >= 80 && msgPercent < 100) {
    await ports.notifyQuotaWarning(tenantId, 'messages', msgPercent);
  }
  if (tokenPercent >= 80 && tokenPercent < 100) {
    await ports.notifyQuotaWarning(tenantId, 'tokens', tokenPercent);
  }

  return { allowed: true, percentUsed: Math.max(msgPercent, tokenPercent) };
}
