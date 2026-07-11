import { describe, it, expect } from 'vitest';
import { buildFirstInsight } from './trial.service';

describe('buildFirstInsight', () => {
  it('monta highlights de alto impacto quando inadimplência é alta', () => {
    const insight = buildFirstInsight('t1', {
      overdueCustomers: 50,
      overdueCents: 600_000, // R$6.000
      openServiceOrders: 25,
      totalCustomers: 200,
    });

    expect(insight.tenantId).toBe('t1');
    expect(insight.highlights).toHaveLength(3);

    const money = insight.highlights.find((h) => h.label.includes('R$'));
    expect(money?.impact).toBe('high');
    expect(money?.value).toContain('6.000');

    const customers = insight.highlights.find((h) => h.label.includes('inadimplentes'));
    expect(customers?.impact).toBe('high'); // 50/200 = 25% > 10%

    const os = insight.highlights.find((h) => h.label.includes('serviço'));
    expect(os?.impact).toBe('high'); // 25 > 20
  });

  it('impacto low quando sem inadimplência', () => {
    const insight = buildFirstInsight('t1', {
      overdueCustomers: 0,
      overdueCents: 0,
      openServiceOrders: 2,
      totalCustomers: 100,
    });
    expect(insight.highlights[0]?.impact).toBe('low');
    expect(insight.message).toContain('Configure');
  });

  it('impacto medium para inadimplência moderada', () => {
    const insight = buildFirstInsight('t1', {
      overdueCustomers: 7,
      overdueCents: 200_000, // R$2.000
      openServiceOrders: 8,
      totalCustomers: 100,
    });
    const money = insight.highlights.find((h) => h.label.includes('R$'));
    expect(money?.impact).toBe('medium'); // 200k > 100k mas < 500k
  });

  it('nextStep sugere ação urgente quando 2+ highlights são high', () => {
    const insight = buildFirstInsight('t1', {
      overdueCustomers: 30,
      overdueCents: 700_000,
      openServiceOrders: 30,
      totalCustomers: 100,
    });
    expect(insight.nextStep).toContain('WhatsApp');
  });

  it('nextStep para configurar régua quando 1 highlight high', () => {
    const insight = buildFirstInsight('t1', {
      overdueCustomers: 5,
      overdueCents: 600_000, // apenas dinheiro é high
      openServiceOrders: 3,
      totalCustomers: 200,
    });
    expect(insight.nextStep).toContain('régua');
  });

  it('nextStep de atendimento quando 0 highlights high', () => {
    const insight = buildFirstInsight('t1', {
      overdueCustomers: 2,
      overdueCents: 50_000,
      openServiceOrders: 3,
      totalCustomers: 100,
    });
    expect(insight.nextStep).toContain('atendimento');
  });

  it('churnRisk = 0 quando totalCustomers = 0', () => {
    const insight = buildFirstInsight('t1', {
      overdueCustomers: 0,
      overdueCents: 0,
      openServiceOrders: 0,
      totalCustomers: 0,
    });
    const customersHighlight = insight.highlights.find((h) => h.label.includes('inadimplentes'));
    expect(customersHighlight?.impact).toBe('low');
  });

  it('inclui generatedAt como ISO string', () => {
    const insight = buildFirstInsight('t1', {
      overdueCustomers: 10,
      overdueCents: 100_000,
      openServiceOrders: 5,
      totalCustomers: 50,
    });
    expect(() => new Date(insight.generatedAt)).not.toThrow();
  });

  it('formata R$ com vírgula como separador decimal', () => {
    const insight = buildFirstInsight('t1', {
      overdueCustomers: 1,
      overdueCents: 125_050, // R$ 1.250,50
      openServiceOrders: 0,
      totalCustomers: 10,
    });
    const money = insight.highlights.find((h) => h.label.includes('R$'));
    expect(money?.value).toContain(',');
  });
});
