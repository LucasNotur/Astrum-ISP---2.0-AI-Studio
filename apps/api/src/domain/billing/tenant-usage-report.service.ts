/**
 * Dossiê #22 — Relatórios de Gasto Individualizado B2B.
 * Gera relatório mensal de consumo por tenant: mensagens IA, tokens,
 * conversas, tickets, custo de infra. Exportável para faturamento.
 */

export interface UsageLineItem {
  category: string;
  description: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface TenantUsageReport {
  tenantId: string;
  tenantName: string;
  period: { from: string; to: string };
  items: UsageLineItem[];
  subtotal: number;
  planCost: number;
  overage: number;
  totalDue: number;
}

export interface UsageReportPorts {
  getMessageCount: (tenantId: string, from: string, to: string) => Promise<number>;
  getTokenCount: (tenantId: string, from: string, to: string) => Promise<number>;
  getConversationCount: (tenantId: string, from: string, to: string) => Promise<number>;
  getTicketCount: (tenantId: string, from: string, to: string) => Promise<number>;
  getStorageMb: (tenantId: string) => Promise<number>;
  getTenantPlan: (tenantId: string) => Promise<{ name: string; monthlyCost: number; includedMessages: number; includedTokens: number; includedStorageMb: number }>;
  getTenantName: (tenantId: string) => Promise<string>;
}

export interface UsagePricing {
  perExtraMessage: number;
  perMillionTokens: number;
  perGbStorage: number;
}

export const DEFAULT_PRICING: UsagePricing = {
  perExtraMessage: 0.02,
  perMillionTokens: 3.0,
  perGbStorage: 0.5,
};

export async function buildUsageReport(
  tenantId: string,
  from: string,
  to: string,
  ports: UsageReportPorts,
  pricing: UsagePricing = DEFAULT_PRICING,
): Promise<TenantUsageReport> {
  const [messages, tokens, conversations, tickets, storageMb, plan, tenantName] = await Promise.all([
    ports.getMessageCount(tenantId, from, to),
    ports.getTokenCount(tenantId, from, to),
    ports.getConversationCount(tenantId, from, to),
    ports.getTicketCount(tenantId, from, to),
    ports.getStorageMb(tenantId),
    ports.getTenantPlan(tenantId),
    ports.getTenantName(tenantId),
  ]);

  const items: UsageLineItem[] = [
    { category: 'messages', description: 'Mensagens IA processadas', quantity: messages, unitCost: 0, total: 0 },
    { category: 'tokens', description: 'Tokens LLM consumidos', quantity: tokens, unitCost: 0, total: 0 },
    { category: 'conversations', description: 'Conversas ativas', quantity: conversations, unitCost: 0, total: 0 },
    { category: 'tickets', description: 'Tickets gerados', quantity: tickets, unitCost: 0, total: 0 },
    { category: 'storage', description: 'Armazenamento (MB)', quantity: storageMb, unitCost: 0, total: 0 },
  ];

  const extraMessages = Math.max(0, messages - plan.includedMessages);
  const extraTokens = Math.max(0, tokens - plan.includedTokens);
  const extraStorageMb = Math.max(0, storageMb - plan.includedStorageMb);

  const overageItems: UsageLineItem[] = [];
  if (extraMessages > 0) {
    overageItems.push({ category: 'overage_messages', description: 'Mensagens excedentes', quantity: extraMessages, unitCost: pricing.perExtraMessage, total: round(extraMessages * pricing.perExtraMessage) });
  }
  if (extraTokens > 0) {
    const tokenCost = round((extraTokens / 1_000_000) * pricing.perMillionTokens);
    overageItems.push({ category: 'overage_tokens', description: 'Tokens excedentes', quantity: extraTokens, unitCost: pricing.perMillionTokens, total: tokenCost });
  }
  if (extraStorageMb > 0) {
    const storageGb = extraStorageMb / 1024;
    overageItems.push({ category: 'overage_storage', description: 'Armazenamento excedente (GB)', quantity: round(storageGb), unitCost: pricing.perGbStorage, total: round(storageGb * pricing.perGbStorage) });
  }

  const allItems = [...items, ...overageItems];
  const overage = overageItems.reduce((s, i) => s + i.total, 0);

  return {
    tenantId,
    tenantName,
    period: { from, to },
    items: allItems,
    subtotal: round(plan.monthlyCost + overage),
    planCost: plan.monthlyCost,
    overage: round(overage),
    totalDue: round(plan.monthlyCost + overage),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
