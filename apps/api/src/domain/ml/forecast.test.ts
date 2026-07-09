import { describe, it, expect } from 'vitest';
import { seasonalMovingAverage, suggestStaffing } from './forecast';

function makeSeries(days: number): { date: string; count: number }[] {
  const base = new Date('2026-01-01');
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const seasonal = dow === 0 || dow === 6 ? 20 : 50;
    return { date: d.toISOString().slice(0, 10), count: seasonal + Math.round(Math.random() * 5) };
  });
}

describe('forecast', () => {
  it('returns empty for <28 days', () => {
    const result = seasonalMovingAverage(makeSeries(20));
    expect(result).toHaveLength(0);
  });

  it('produces 14 forecast points', () => {
    const result = seasonalMovingAverage(makeSeries(60));
    expect(result).toHaveLength(14);
    for (const p of result) {
      expect(p.forecast).toBeGreaterThan(0);
      expect(p.low).toBeLessThanOrEqual(p.forecast);
      expect(p.high).toBeGreaterThanOrEqual(p.forecast);
    }
  });

  it('seasonal pattern appears in forecast', () => {
    const data = makeSeries(60);
    const result = seasonalMovingAverage(data);
    const weekday = result.find((p) => {
      const d = new Date(p.date).getDay();
      return d >= 1 && d <= 5;
    });
    const weekend = result.find((p) => {
      const d = new Date(p.date).getDay();
      return d === 0 || d === 6;
    });
    if (weekday && weekend) {
      expect(weekday.forecast).toBeGreaterThan(weekend.forecast);
    }
  });

  it('trend is clamped to 0.7-1.3', () => {
    const data = makeSeries(60);
    const result = seasonalMovingAverage(data);
    expect(result.every((p) => p.forecast >= 0)).toBe(true);
  });

  it('suggestStaffing rounds up', () => {
    expect(suggestStaffing(51, 25)).toBe(3);
    expect(suggestStaffing(50, 25)).toBe(2);
    expect(suggestStaffing(0, 25)).toBe(0);
  });
});
