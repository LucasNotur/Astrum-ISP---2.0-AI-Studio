import { describe, it, expect } from 'vitest';
import { percentile, buildReport, BUDGETS_MS, isLatencyBudgetEnabled } from './latency-budget';

describe('latency-budget', () => {
  it('percentile computes correctly', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(100);
    expect(percentile([], 50)).toBe(0);
  });

  it('buildReport marks exceeded correctly', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({
      node: 'generate',
      duration_ms: i < 90 ? 5000 : 8000,
    }));
    const report = buildReport(data);
    expect(report).toHaveLength(1);
    expect(report[0].exceeded).toBe(true);
    expect(report[0].p95).toBe(8000);
  });

  it('buildReport marks not exceeded when within budget', () => {
    const data = Array.from({ length: 100 }, () => ({
      node: 'classify',
      duration_ms: 500,
    }));
    const report = buildReport(data);
    expect(report[0].exceeded).toBe(false);
  });

  it('isLatencyBudgetEnabled false by default', () => {
    delete (process.env as any).LATENCY_BUDGET_ENABLED;
    expect(isLatencyBudgetEnabled()).toBe(false);
  });

  it('BUDGETS_MS has generate node', () => {
    expect(BUDGETS_MS.generate).toBe(6000);
  });
});
