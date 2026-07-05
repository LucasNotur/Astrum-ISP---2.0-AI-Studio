import { describe, it, expect } from 'vitest';
import { computeChurnScore, CHURN_WEIGHTS } from './churn-score';
import type { ChurnFeatures } from './churn-score';

const base: ChurnFeatures = {
  tenureDays: 365,
  overdueCount90d: 0,
  avgPaymentDelayDays180d: 0,
  tickets30d: 0,
  tickets90d: 0,
  negativeSentimentRatio90d: 0,
  downgrades180d: 0,
  mrrCents: 9900,
};

describe('computeChurnScore', () => {
  it('cliente perfeito = score 0 e banda low', () => {
    const result = computeChurnScore(base);
    expect(result.score).toBe(0);
    expect(result.riskBand).toBe('low');
  });

  it('score máximo com todos os fatores no teto', () => {
    const result = computeChurnScore({
      ...base,
      overdueCount90d: 10,
      avgPaymentDelayDays180d: 30,
      tickets90d: 10,
      negativeSentimentRatio90d: 1,
      downgrades180d: 1,
      tenureDays: 30,
    });
    expect(result.score).toBe(100);
    expect(result.riskBand).toBe('critical');
  });

  it('cliente com 2 faturas atrasadas e atraso medio de 10 dias', () => {
    // overdue: 25 * (2/3) = 16.67
    // delay: 20 * (10/15) = 13.33
    // total: ~30
    const result = computeChurnScore({
      ...base,
      overdueCount90d: 2,
      avgPaymentDelayDays180d: 10,
    });
    expect(result.score).toBeCloseTo(30, 0);
    expect(result.riskBand).toBe('medium');
  });

  it('banda low: score < 25', () => {
    expect(computeChurnScore({ ...base, overdueCount90d: 2 }).riskBand).toBe('low');
  });

  it('banda medium: 25 <= score < 50', () => {
    // overdue: 25*(1) = 25, delay: 20*(0.5) = 10 -> 35
    expect(computeChurnScore({
      ...base, overdueCount90d: 3, avgPaymentDelayDays180d: 7.5,
    }).riskBand).toBe('medium');
  });

  it('banda high: 50 <= score < 75', () => {
    // overdue: 25*(1) = 25, tickets: 20*(1) = 20, negative: 15*0.5 = 7.5 -> 52.5
    expect(computeChurnScore({
      ...base, overdueCount90d: 5, tickets90d: 6, negativeSentimentRatio90d: 0.5,
    }).riskBand).toBe('high');
  });

  it('banda critical: score >= 75', () => {
    // overdue: 25, delay: 20, tickets: 20, negative: 15 -> 80
    expect(computeChurnScore({
      ...base,
      overdueCount90d: 5,
      avgPaymentDelayDays180d: 20,
      tickets90d: 10,
      negativeSentimentRatio90d: 1,
    }).riskBand).toBe('critical');
  });

  it('clamp inferior: score nunca fica negativo', () => {
    // sem dados, score deve ser >= 0
    const result = computeChurnScore({
      ...base, tenureDays: 0, overdueCount90d: 0,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('clamp superior: score nunca passa de 100', () => {
    const result = computeChurnScore({
      ...base,
      overdueCount90d: 999,
      avgPaymentDelayDays180d: 999,
      tickets90d: 999,
      negativeSentimentRatio90d: 999,
      downgrades180d: 999,
      tenureDays: 0,
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('downgrade contribui com 10 pontos', () => {
    const without = computeChurnScore(base);
    const withDowngrade = computeChurnScore({ ...base, downgrades180d: 1 });
    expect(withDowngrade.score - without.score).toBeCloseTo(CHURN_WEIGHTS.downgrade, 0);
  });

  it('novo cliente (tenure < 90) contribui com 10 pontos', () => {
    const old = computeChurnScore(base);
    const newcomer = computeChurnScore({ ...base, tenureDays: 30 });
    expect(newcomer.score - old.score).toBeCloseTo(CHURN_WEIGHTS.newCustomer, 0);
  });

  it('tenureDays = 90 nao conta como novo cliente', () => {
    const at90 = computeChurnScore({ ...base, tenureDays: 90 });
    const at89 = computeChurnScore({ ...base, tenureDays: 89 });
    expect(at89.score - at90.score).toBeCloseTo(CHURN_WEIGHTS.newCustomer, 0);
  });

  it('mrrCents nao afeta o score na fase 1 (observacional)', () => {
    const low = computeChurnScore({ ...base, mrrCents: 1000 });
    const high = computeChurnScore({ ...base, mrrCents: 100000 });
    expect(low.score).toBe(high.score);
  });

  it('negativeSentimentRatio90d proporcional', () => {
    const z = computeChurnScore({ ...base, negativeSentimentRatio90d: 0 });
    const half = computeChurnScore({ ...base, negativeSentimentRatio90d: 0.5 });
    const full = computeChurnScore({ ...base, negativeSentimentRatio90d: 1 });
    expect(half.score - z.score).toBeCloseTo(CHURN_WEIGHTS.negativeSentiment * 0.5, 0);
    expect(full.score - z.score).toBeCloseTo(CHURN_WEIGHTS.negativeSentiment, 0);
  });

  it('tickets90d cap = 5, além nao soma mais', () => {
    const at5 = computeChurnScore({ ...base, tickets90d: 5 });
    const at10 = computeChurnScore({ ...base, tickets90d: 10 });
    expect(at10.score).toBe(at5.score);
  });

  it('overdue cap = 3', () => {
    const at3 = computeChurnScore({ ...base, overdueCount90d: 3 });
    const at10 = computeChurnScore({ ...base, overdueCount90d: 10 });
    expect(at10.score).toBe(at3.score);
  });
});
