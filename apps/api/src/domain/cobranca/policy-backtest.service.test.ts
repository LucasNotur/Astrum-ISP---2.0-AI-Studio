import { describe, it, expect, vi } from 'vitest';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../infrastructure/logging/logger', () => ({
  infraLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  iaLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import supabase from '../../infrastructure/database/supabase.client';
import {
  summarizeHistory,
  projectPolicy,
  backtestPolicy,
  CALIBRATION,
  type InvoiceRow,
  type CobrancaPolicy,
} from './policy-backtest.service';

const day = (offset: number) => new Date(Date.UTC(2026, 5, 15 + offset)).toISOString();

function invoice(amount: number, kind: 'onTime' | 'late' | 'overdue' | 'pendingFuture'): InvoiceRow {
  const due = day(0);
  if (kind === 'onTime') return { amount_cents: amount, status: 'paid', due_date: due, paid_at: day(-1) };
  if (kind === 'late') return { amount_cents: amount, status: 'paid', due_date: due, paid_at: day(8) };
  if (kind === 'overdue') return { amount_cents: amount, status: 'overdue', due_date: due, paid_at: null };
  return { amount_cents: amount, status: 'pending', due_date: due, paid_at: null };
}

const basePolicy: CobrancaPolicy = {
  reminderDaysBefore: 3,
  remindersAfterDue: [3, 7, 15],
  settlementDiscountPct: 0,
  primaryChannel: 'whatsapp',
};

describe('summarizeHistory (fatos, não projeção)', () => {
  it('classifica em dia / atrasado / inadimplente e exclui pendente não-vencida', () => {
    const b = summarizeHistory([
      invoice(10000, 'onTime'),
      invoice(10000, 'late'),
      invoice(10000, 'overdue'),
      invoice(10000, 'pendingFuture'), // fora do baseline
    ], 90);
    expect(b.billedCents).toBe(30000);
    expect(b.paidOnTimeCents).toBe(10000);
    expect(b.paidLateCents).toBe(10000);
    expect(b.unpaidCents).toBe(10000);
    expect(b.avgDaysLate).toBe(8);
  });
});

describe('projectPolicy (elasticidades explícitas)', () => {
  const baseline = summarizeHistory([
    ...Array.from({ length: 8 }, () => invoice(10000, 'onTime')),
    invoice(10000, 'late'),
    invoice(10000, 'overdue'), // R$ 100 inadimplentes
  ], 90);

  it('recuperação decrescente por cobrança pós-vencimento (8%, 5%, 3%)', () => {
    const r = projectPolicy(baseline, basePolicy);
    // 10000 × 0.08 = 800; resto 9200 × 0.05 = 460; resto 8740 × 0.03 = 262 → 1522
    expect(r.projectedGainCents.base).toBe(800 + 460 + 262);
    expect(r.discountCostCents).toBe(0);
  });

  it('canal email rende menos que whatsapp (multiplicador 0.6)', () => {
    const wa = projectPolicy(baseline, basePolicy);
    const em = projectPolicy(baseline, { ...basePolicy, primaryChannel: 'email' });
    expect(em.projectedGainCents.base).toBeLessThan(wa.projectedGainCents.base);
  });

  it('desconto converte mais MAS abate o custo do desconto (honestidade)', () => {
    const semDesc = projectPolicy(baseline, basePolicy);
    const comDesc = projectPolicy(baseline, { ...basePolicy, settlementDiscountPct: 10 });
    expect(comDesc.projectedGainCents.base).toBeGreaterThan(semDesc.projectedGainCents.base);
    expect(comDesc.discountCostCents).toBeGreaterThan(0);
    expect(comDesc.assumptions.join(' ')).toContain('JÁ abatido');
  });

  it('cenários: pessimista = 50% do ganho, otimista = 130%', () => {
    const r = projectPolicy(baseline, basePolicy);
    expect(r.projectedGainCents.pessimista).toBe(Math.round(r.projectedGainCents.base * 0.5));
    expect(r.projectedGainCents.otimista).toBe(Math.round(r.projectedGainCents.base * 1.3));
  });

  it('todo resultado carrega o disclaimer do viés ("o passado não reage")', () => {
    const r = projectPolicy(baseline, basePolicy);
    expect(r.disclaimer).toContain('NÃO reage');
    expect(r.assumptions.some((a) => a.includes('CALIBRATION') || a.includes('estimativas'))).toBe(true);
  });

  it('desconto respeita o cap de conversão (30%)', () => {
    const conv = Math.min(CALIBRATION.discountConversionCap, 30 * CALIBRATION.discountConversionPerPct);
    expect(conv).toBe(0.30);
  });
});

describe('backtestPolicy (orquestração)', () => {
  it('recusa histórico insuficiente (<30 faturas) em vez de chutar', async () => {
    const chain: any = {
      select: () => chain, eq: () => chain, gte: () => chain,
      then: (cb: any) => Promise.resolve({ data: [invoice(1000, 'onTime')], error: null }).then(cb),
    };
    vi.mocked(supabase.from).mockReturnValue(chain);
    await expect(backtestPolicy('t1', basePolicy)).rejects.toThrow('insuficiente');
  });

  it('com histórico razoável devolve o comparativo completo', async () => {
    const rows = [
      ...Array.from({ length: 30 }, () => invoice(10000, 'onTime')),
      ...Array.from({ length: 5 }, () => invoice(10000, 'overdue')),
    ];
    const chain: any = {
      select: () => chain, eq: () => chain, gte: () => chain,
      then: (cb: any) => Promise.resolve({ data: rows, error: null }).then(cb),
    };
    vi.mocked(supabase.from).mockReturnValue(chain);
    const r = await backtestPolicy('t1', basePolicy);
    expect(r.baseline.invoicesTotal).toBe(35);
    expect(r.projectedGainCents.base).toBeGreaterThan(0);
  });
});
