import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaasMetrics, Tenant, Ticket, DB } from '../../../src/lib/saasMetrics';

describe('SaaS Metrics Tests', () => {
  let db: import('vitest').Mocked<DB>;
  let metrics: SaasMetrics;

  beforeEach(() => {
    vi.clearAllMocks();
    db = {
      upsertMetric: vi.fn().mockResolvedValue(undefined),
    };
    metrics = new SaasMetrics(db);
  });

  it('1. calculateMRR com 3 tenants -> retorna R$2491 exato', () => {
    const tenants: Tenant[] = [
      { id: 't1', status: 'active', monthly_price: 297 },
      { id: 't2', status: 'active', monthly_price: 697 },
      { id: 't3', status: 'active', monthly_price: 1497 },
    ];
    expect(metrics.calculateMRR(tenants)).toBe(2491);
  });

  it('2. calculateMRR com tenant suspenso -> NÃO inclui na soma', () => {
    const tenants: Tenant[] = [
      { id: 't1', status: 'active', monthly_price: 100 },
      { id: 't2', status: 'suspended', monthly_price: 200 },
      { id: 't3', status: 'canceled', monthly_price: 300 },
    ];
    expect(metrics.calculateMRR(tenants)).toBe(100);
  });

  it('3. calculateChurnRate com 1 cancelamento em 10 tenants -> retorna 10%', () => {
    expect(metrics.calculateChurnRate(10, 1)).toBe(10);
  });

  it('4. FCR: 8 resolvidos sem escalamento em 10 total -> retorna 80%', () => {
    const tickets = Array.from({ length: 10 }, (_, i) => ({
      id: `tk${i}`,
      tenant_id: 't1',
      created_at: 0,
      resolved: true,
      escalated: i >= 8 // First 8 are false, last 2 are true
    })) as Ticket[];

    expect(metrics.calculateFCR(tickets)).toBe(80);
  });

  it('5. FCR: ticket reaberto em menos de 24h -> NÃO conta como resolvido', () => {
    const tickets: Ticket[] = [
      { id: 'tk1', tenant_id: 't1', created_at: 0, resolved: true, escalated: false, reopened_within_24h: true },
      { id: 'tk2', tenant_id: 't1', created_at: 0, resolved: true, escalated: false, reopened_within_24h: false },
    ];
    expect(metrics.calculateFCR(tickets)).toBe(50);
  });

  it('6. TMA com timestamps reais -> calcula média corretamente', () => {
    const t1_created = new Date('2026-05-24T10:00:00Z').getTime();
    const t1_resolved = new Date('2026-05-24T10:30:00Z').getTime(); // 30 min diff
    
    const t2_created = new Date('2026-05-24T11:00:00Z').getTime();
    const t2_resolved = new Date('2026-05-24T12:00:00Z').getTime(); // 60 min diff

    const tickets: Ticket[] = [
      { id: 'tk1', tenant_id: 't1', created_at: t1_created, resolved: true, resolved_at: t1_resolved },
      { id: 'tk2', tenant_id: 't1', created_at: t2_created, resolved: true, resolved_at: t2_resolved },
    ];
    
    const expectedAverageMs = 45 * 60 * 1000;
    expect(metrics.calculateTMA(tickets)).toBe(expectedAverageMs);
  });

  it('7. TMR: campo human_first_response_at ausente -> retorna null, não zero nem NaN', () => {
    const ticket: Ticket = { id: 'tk1', tenant_id: 't1', created_at: 100, resolved: true };
    expect(metrics.calculateTMR(ticket)).toBeNull();
  });

  it('8. Job rodando 2 vezes no mesmo dia -> sobrescreve (não duplica) o registro', async () => {
    await metrics.runDailyJob('2026-05-24', { mrr: 1000 });
    await metrics.runDailyJob('2026-05-24', { mrr: 1500 });
    
    expect(db.upsertMetric).toHaveBeenCalledTimes(2);
    expect(db.upsertMetric).toHaveBeenLastCalledWith('2026-05-24', { mrr: 1500 });
  });

  it('9. Métricas do tenant A -> nunca aparecem nas do tenant B', () => {
    const tickets: Ticket[] = [
      { id: 'tA1', tenant_id: 'tenant-A', resolved: true, escalated: false, created_at: 0 },
      { id: 'tB1', tenant_id: 'tenant-B', resolved: false, escalated: false, created_at: 0 },
    ];
    
    const metricsA = metrics.getTenantMetrics('tenant-A', tickets);
    const metricsB = metrics.getTenantMetrics('tenant-B', tickets);
    
    expect(metricsA.fcr).toBe(100);
    expect(metricsB.fcr).toBe(0);
  });

  it('10. Nenhum cálculo retorna NaN, Infinity ou undefined', () => {
    expect(metrics.calculateMRR([])).toBe(0);
    expect(metrics.calculateChurnRate(0, 0)).toBe(0);
    expect(metrics.calculateFCR([])).toBe(0);
    expect(metrics.calculateTMA([])).toBe(0);
    
    const emptyTicket: Ticket = { id: 'tk1', tenant_id: 't1', created_at: 100, resolved: true };
    expect(metrics.calculateTMR(emptyTicket)).toBeNull();
  });
});
