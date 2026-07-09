import { describe, it, expect } from 'vitest';
import {
  computeLtv,
  MONTHLY_CHURN_BY_BAND,
  LTV_MARGIN,
} from './ltv';
import type { RiskBand } from './churn-score';

describe('computeLtv', () => {
  it.each<[RiskBand, number]>([
    ['low', 60],
    ['medium', 50],
    ['high', 20],
    ['critical', 10],
  ])('band=%s → expected lifetime=%d months', (band, expectedMonths) => {
    const result = computeLtv({ mrrCents: 10000, band });
    expect(result.months).toBe(expectedMonths);
    expect(result.ltvCents).toBe(Math.round(10000 * LTV_MARGIN * expectedMonths));
  });

  it('caps lifetime at 60 months (low band: 1/0.005 = 200 → capped to 60)', () => {
    const result = computeLtv({ mrrCents: 10000, band: 'low' });
    expect(result.months).toBe(60);
  });

  it('mrr 0 → ltv 0', () => {
    const result = computeLtv({ mrrCents: 0, band: 'high' });
    expect(result.ltvCents).toBe(0);
    expect(result.months).toBe(0);
  });

  it('negative mrr → ltv 0', () => {
    const result = computeLtv({ mrrCents: -5000, band: 'medium' });
    expect(result.ltvCents).toBe(0);
  });

  it('formula matches: ltv = mrr × margin × months', () => {
    const mrr = 7500;
    const band: RiskBand = 'critical';
    const { ltvCents, months } = computeLtv({ mrrCents: mrr, band });
    const expected = Math.round(mrr * LTV_MARGIN * months);
    expect(ltvCents).toBe(expected);
  });

  it('all 4 bands produce different results for same MRR', () => {
    const bands: RiskBand[] = ['low', 'medium', 'high', 'critical'];
    const results = bands.map((b) => computeLtv({ mrrCents: 10000, band: b }));
    const ltvs = results.map((r) => r.ltvCents);
    const unique = new Set(ltvs);
    expect(unique.size).toBe(4);
    // LTV should decrease as risk increases (lower expected lifetime)
    expect(ltvs[0]).toBeGreaterThan(ltvs[1]);
    expect(ltvs[1]).toBeGreaterThan(ltvs[2]);
    expect(ltvs[2]).toBeGreaterThan(ltvs[3]);
  });

  it('exports MONTHLY_CHURN_BY_BAND with correct values', () => {
    expect(MONTHLY_CHURN_BY_BAND.low).toBe(0.005);
    expect(MONTHLY_CHURN_BY_BAND.medium).toBe(0.02);
    expect(MONTHLY_CHURN_BY_BAND.high).toBe(0.05);
    expect(MONTHLY_CHURN_BY_BAND.critical).toBe(0.10);
  });
});
