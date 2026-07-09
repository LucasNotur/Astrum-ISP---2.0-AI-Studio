import { describe, it, expect } from 'vitest';
import { ewma, zscore, detectAnomalies, anomalySeverity } from './anomaly';

describe('anomaly', () => {
  it('ewma smooths values', () => {
    const result = ewma([10, 20, 30, 40, 50], 0.5);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe(10);
    expect(result[1]).toBe(15);
  });

  it('zscore returns 0 when std is 0', () => {
    expect(zscore(5, 5, 0)).toBe(0);
  });

  it('zscore computes correctly', () => {
    expect(zscore(10, 5, 2.5)).toBe(2);
  });

  it('detectAnomalies returns empty for insufficient points', () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ t: `t${i}`, v: 1 }));
    const { anomalies } = detectAnomalies(points);
    expect(anomalies).toHaveLength(0);
  });

  it('detectAnomalies finds step change', () => {
    const normal = Array.from({ length: 50 }, (_, i) => ({ t: `t${i}`, v: 10 + Math.random() * 0.1 }));
    normal[49] = { t: 't49', v: 100 };
    const { anomalies } = detectAnomalies(normal, { zThreshold: 3, minPoints: 48 });
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies.some((a) => a.t === 't49')).toBe(true);
  });

  it('detectAnomalies gaussian noise does not trigger', () => {
    const points = Array.from({ length: 50 }, (_, i) => ({
      t: `t${i}`,
      v: 10 + (Math.random() - 0.5) * 0.5,
    }));
    const { anomalies } = detectAnomalies(points, { zThreshold: 3, minPoints: 48 });
    expect(anomalies.length).toBeLessThanOrEqual(2);
  });

  it('anomalySeverity returns alto for z>=4', () => {
    expect(anomalySeverity(4)).toBe('alto');
    expect(anomalySeverity(3)).toBe('medio');
  });
});
