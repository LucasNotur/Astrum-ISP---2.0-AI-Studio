import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  iaLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import supabase from '../../infrastructure/database/supabase.client';
import { forecastCashflow } from './cashflow-forecast.service';

const day = (offset: number) => new Date(Date.UTC(2026, 5, 15 + offset)).toISOString();

function chain(data: any[]) {
  const c: any = {
    select: () => c, eq: () => c, gte: () => c,
    then: (cb: any) => Promise.resolve({ data, error: null }).then(cb),
  };
  return c;
}

function mockDb(invoices: any[], actives: any[]) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    if (table === 'invoices') return chain(invoices);
    if (table === 'customers') return chain(actives);
    throw new Error(`tabela: ${table}`);
  }) as any);
}

describe('D-08 — forecastCashflow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('projeta 3 meses com cenários e mede a inadimplência recuperável', async () => {
    // 70% em dia, 20% atrasado-recuperado, 10% perdido
    const invoices = [
      ...Array.from({ length: 7 }, () => ({ amount_cents: 10000, status: 'paid', due_date: day(0), paid_at: day(-1) })),
      ...Array.from({ length: 2 }, () => ({ amount_cents: 10000, status: 'paid', due_date: day(0), paid_at: day(9) })),
      { amount_cents: 10000, status: 'overdue', due_date: day(0), paid_at: null },
    ];
    const actives = Array.from({ length: 100 }, () => ({ mrr_cents: 10000 }));
    mockDb(invoices, actives);

    const r = await forecastCashflow('t1');
    expect(r.activeCustomers).toBe(100);
    expect(r.avgMrrCents).toBe(10000);
    expect(r.observed.onTimeRate).toBe(0.7);
    expect(r.observed.lateRecoveryRate).toBe(0.2);
    expect(r.observed.lossRate).toBe(0.1);

    expect(r.months).toHaveLength(3);
    const m1 = r.months[0]!;
    expect(m1.expectedBillingCents).toBe(100 * 10000);
    expect(m1.inflow.base).toBe(Math.round(1000000 * 0.9));           // 70+20%
    expect(m1.inflow.pessimista).toBe(Math.round(1000000 * 0.82));    // -8pp
    expect(m1.inflow.otimista).toBe(Math.round(1000000 * 0.94));      // +4pp

    // recuperável: 10000 em aberto × (0.2/(0.2+0.1)) ≈ 6667
    expect(r.openOverdueCents).toBe(10000);
    expect(r.recoverableOverdueCents).toBe(Math.round(10000 * (0.2 / 0.3)));
    expect(r.headline).toContain('Caixa projetado 90d');
    expect(r.assumptions.length).toBeGreaterThanOrEqual(3);
  });

  it('sem faturamento na janela → erro honesto em vez de projeção vazia', async () => {
    mockDb([], [{ mrr_cents: 10000 }]);
    await expect(forecastCashflow('t1')).rejects.toThrow('sem faturamento');
  });

  it('taxa de coleta é clampada em [0,1] mesmo com cenário otimista', async () => {
    // 100% em dia: otimista não pode passar de 100%
    const invoices = Array.from({ length: 5 }, () => ({ amount_cents: 10000, status: 'paid', due_date: day(0), paid_at: day(-1) }));
    mockDb(invoices, [{ mrr_cents: 10000 }]);
    const r = await forecastCashflow('t1');
    expect(r.months[0]!.inflow.otimista).toBeLessThanOrEqual(r.months[0]!.expectedBillingCents);
  });
});
