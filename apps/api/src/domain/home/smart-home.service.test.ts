import { describe, it, expect, vi } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
  default: { from: vi.fn() },
}));
vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  iaLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { buildSmartHome, type SmartHomePort } from './smart-home.service';

const day = (offset: number) => new Date(Date.UTC(2026, 5, 15 + offset)).toISOString();

type TableData = Record<string, any[]>;

function mockDb(tables: TableData): SmartHomePort {
  return {
    from: (table: string) => {
      const rows = tables[table] ?? [];
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        gte: () => chain,
        gt: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (cb: any) => Promise.resolve({ data: rows, error: null, count: rows.length }).then(cb),
      };
      return chain;
    },
  };
}

describe('G-01 — buildSmartHome', () => {
  it('owner sees incidents, finance, churn, brain, network, and inbox', async () => {
    const db = mockDb({
      incidents: [
        { id: '1', title: 'CTO-42 down', status: 'confirmada', severity: 'critical', affected_customers: 80 },
      ],
      conversations: [
        { id: 'c1', status: 'escalated' },
        { id: 'c2', status: 'open' },
      ],
      invoices: [
        ...Array.from({ length: 20 }, () => ({ amount_cents: 10000, status: 'paid', due_date: day(0), paid_at: day(-1) })),
        ...Array.from({ length: 10 }, () => ({ amount_cents: 10000, status: 'paid', due_date: day(0), paid_at: day(8) })),
        ...Array.from({ length: 5 }, () => ({ amount_cents: 10000, status: 'overdue', due_date: day(0), paid_at: null })),
      ],
      customers: Array.from({ length: 50 }, () => ({ id: 'x', mrr_cents: 5000, status: 'active' })),
      churn_scores: [
        { customer_id: 'a', score: 0.9, risk_band: 'critical' },
        { customer_id: 'b', score: 0.8, risk_band: 'high' },
      ],
      ai_reflections: [{
        reflection_date: '2026-07-23',
        metrics: { aiResolutionRate: 72 },
        hypotheses: [{ text: 'Churn subindo no bairro X', severity: 'high' }],
        actions: [{ name: 'Enviar campanha', status: 'pending' }],
      }],
      network_ctos: [
        { id: 'cto1', name: 'CTO-1', used_ports: 14, total_ports: 16 },
        { id: 'cto2', name: 'CTO-2', used_ports: 5, total_ports: 16 },
      ],
      service_orders: [],
    });

    const r = await buildSmartHome('t1', 'admin', 'u1', db);

    expect(r.healthScore).toBeLessThan(100);
    expect(r.healthLabel).toBeDefined();
    expect(r.headline).toContain('atenção');

    const sources = r.items.map(i => i.source);
    expect(sources).toContain('incidents');
    expect(sources).toContain('inbox');
    expect(sources).toContain('finance');
    expect(sources).toContain('churn');
    expect(sources).toContain('brain');
    expect(sources).toContain('network');

    expect(r.snapshot.activeCustomers).toBe(50);
    expect(r.snapshot.mrrCents).toBe(250000);
    expect(r.snapshot.openOverdueCents).toBe(50000);
    expect(r.snapshot.escalatedConversations).toBe(1);
    expect(r.snapshot.activeIncidents).toBe(1);

    expect(r.items[0]!.severity).toBe('critical');
  });

  it('operator sees inbox + incidents but NOT finance/churn/brain', async () => {
    const db = mockDb({
      incidents: [],
      conversations: [
        { id: 'c1', status: 'escalated' },
        { id: 'c2', status: 'escalated' },
        { id: 'c3', status: 'escalated' },
        { id: 'c4', status: 'open' },
      ],
      service_orders: [
        { id: 'os1', status: 'pending' },
      ],
    });

    const r = await buildSmartHome('t1', 'operator', 'u1', db);

    const sources = r.items.map(i => i.source);
    expect(sources).toContain('inbox');
    expect(sources).not.toContain('finance');
    expect(sources).not.toContain('churn');
    expect(sources).not.toContain('brain');

    expect(r.snapshot.escalatedConversations).toBe(3);
    expect(r.snapshot.todayOrders).toBe(1);
  });

  it('viewer (technician) sees field agenda + incidents, not finance', async () => {
    const db = mockDb({
      incidents: [],
      service_orders: [
        { id: 'os1', status: 'pending' },
        { id: 'os2', status: 'assigned' },
        { id: 'os3', status: 'in_progress' },
      ],
    });

    const r = await buildSmartHome('t1', 'viewer', 'u1', db);

    const sources = r.items.map(i => i.source);
    expect(sources).toContain('field');
    expect(sources).not.toContain('finance');
    expect(sources).not.toContain('churn');
    expect(r.snapshot.todayOrders).toBe(3);
  });

  it('empty data returns healthy score and no items', async () => {
    const db = mockDb({
      incidents: [],
      conversations: [],
      invoices: [],
      customers: [],
      churn_scores: [],
      ai_reflections: [],
      network_ctos: [],
      service_orders: [],
    });

    const r = await buildSmartHome('t1', 'admin', 'u1', db);

    expect(r.healthScore).toBe(100);
    expect(r.healthLabel).toBe('Operação saudável');
    expect(r.headline).toContain('controle');
    expect(r.items).toHaveLength(0);
  });

  it('items are sorted by severity (critical first)', async () => {
    const db = mockDb({
      incidents: [
        { id: '1', title: 'Down', status: 'confirmada', severity: 'critical', affected_customers: 10 },
      ],
      conversations: [],
      invoices: Array.from({ length: 35 }, () => ({
        amount_cents: 10000, status: 'overdue', due_date: day(0), paid_at: null,
      })),
      customers: [{ id: 'x', mrr_cents: 5000, status: 'active' }],
      churn_scores: [],
      ai_reflections: [{
        reflection_date: '2026-07-23',
        metrics: {},
        hypotheses: [],
        actions: [{ name: 'test', status: 'pending' }],
      }],
      network_ctos: [],
      service_orders: [],
    });

    const r = await buildSmartHome('t1', 'admin', 'u1', db);

    expect(r.items.length).toBeGreaterThan(1);
    const severities = r.items.map(i => i.severity);
    const rankMap = { critical: 0, warning: 1, info: 2, success: 3 } as const;
    for (let i = 1; i < severities.length; i++) {
      expect(rankMap[severities[i] as keyof typeof rankMap]).toBeGreaterThanOrEqual(
        rankMap[severities[i - 1] as keyof typeof rankMap],
      );
    }
  });

  it('health score clamps to [0, 100]', async () => {
    const db = mockDb({
      incidents: Array.from({ length: 5 }, (_, i) => ({
        id: `i${i}`, title: 'Down', status: 'confirmada', severity: 'critical', affected_customers: 100,
      })),
      conversations: Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, status: 'escalated' })),
      invoices: Array.from({ length: 35 }, () => ({
        amount_cents: 10000, status: 'overdue', due_date: day(0), paid_at: null,
      })),
      customers: [{ id: 'x', mrr_cents: 5000, status: 'active' }],
      churn_scores: Array.from({ length: 15 }, (_, i) => ({
        customer_id: `c${i}`, score: 0.9, risk_band: 'critical',
      })),
      ai_reflections: [],
      network_ctos: [],
      service_orders: [],
    });

    const r = await buildSmartHome('t1', 'admin', 'u1', db);
    expect(r.healthScore).toBeGreaterThanOrEqual(0);
    expect(r.healthScore).toBeLessThanOrEqual(100);
  });
});
