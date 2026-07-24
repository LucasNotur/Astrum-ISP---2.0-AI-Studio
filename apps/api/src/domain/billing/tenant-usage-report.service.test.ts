import { describe, it, expect } from 'vitest';
import { buildUsageReport, UsageReportPorts, DEFAULT_PRICING } from './tenant-usage-report.service';

function makePorts(overrides: Partial<Record<string, any>> = {}): UsageReportPorts {
  return {
    getMessageCount: async () => overrides.messages ?? 500,
    getTokenCount: async () => overrides.tokens ?? 2_000_000,
    getConversationCount: async () => overrides.conversations ?? 120,
    getTicketCount: async () => overrides.tickets ?? 45,
    getStorageMb: async () => overrides.storageMb ?? 800,
    getTenantPlan: async () => overrides.plan ?? {
      name: 'pro',
      monthlyCost: 299,
      includedMessages: 1000,
      includedTokens: 5_000_000,
      includedStorageMb: 1024,
    },
    getTenantName: async () => 'ISP Teste',
  };
}

describe('tenant-usage-report.service', () => {
  it('gera relatório sem overage quando dentro do plano', async () => {
    const report = await buildUsageReport('t1', '2026-07-01', '2026-07-31', makePorts());
    expect(report.tenantName).toBe('ISP Teste');
    expect(report.planCost).toBe(299);
    expect(report.overage).toBe(0);
    expect(report.totalDue).toBe(299);
    expect(report.items.filter((i) => i.category.startsWith('overage'))).toHaveLength(0);
  });

  it('calcula overage de mensagens excedentes', async () => {
    const report = await buildUsageReport('t1', '2026-07-01', '2026-07-31', makePorts({ messages: 1500 }));
    const overageItem = report.items.find((i) => i.category === 'overage_messages');
    expect(overageItem).toBeDefined();
    expect(overageItem!.quantity).toBe(500);
    expect(overageItem!.total).toBe(10);
    expect(report.overage).toBe(10);
    expect(report.totalDue).toBe(309);
  });

  it('calcula overage de tokens excedentes', async () => {
    const report = await buildUsageReport('t1', '2026-07-01', '2026-07-31', makePorts({ tokens: 8_000_000 }));
    const overageItem = report.items.find((i) => i.category === 'overage_tokens');
    expect(overageItem).toBeDefined();
    expect(overageItem!.quantity).toBe(3_000_000);
    expect(overageItem!.total).toBe(9);
  });

  it('calcula overage de storage excedente', async () => {
    const report = await buildUsageReport('t1', '2026-07-01', '2026-07-31', makePorts({ storageMb: 2048 }));
    const overageItem = report.items.find((i) => i.category === 'overage_storage');
    expect(overageItem).toBeDefined();
    expect(overageItem!.total).toBe(0.5);
  });

  it('inclui 5 categorias base de uso', async () => {
    const report = await buildUsageReport('t1', '2026-07-01', '2026-07-31', makePorts());
    const baseItems = report.items.filter((i) => !i.category.startsWith('overage'));
    expect(baseItems).toHaveLength(5);
    const cats = baseItems.map((i) => i.category);
    expect(cats).toContain('messages');
    expect(cats).toContain('tokens');
    expect(cats).toContain('conversations');
    expect(cats).toContain('tickets');
    expect(cats).toContain('storage');
  });

  it('pricing default está configurado', () => {
    expect(DEFAULT_PRICING.perExtraMessage).toBe(0.02);
    expect(DEFAULT_PRICING.perMillionTokens).toBe(3.0);
    expect(DEFAULT_PRICING.perGbStorage).toBe(0.5);
  });
});
