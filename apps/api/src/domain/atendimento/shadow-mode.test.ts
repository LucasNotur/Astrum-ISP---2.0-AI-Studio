import { describe, it, expect, vi } from 'vitest';
import { computeEquivalenceRate } from './shadow-mode';

describe('computeEquivalenceRate', () => {
  it('calcula a taxa de equivalência (gate ≥95%)', async () => {
    const judge = vi.fn(async (v2: string, legacy: string) => v2 === legacy);
    const pairs = [
      { v2: 'a', legacy: 'a' },
      { v2: 'b', legacy: 'b' },
      { v2: 'c', legacy: 'x' },
    ];
    const r = await computeEquivalenceRate(pairs, judge);
    expect(r.total).toBe(3);
    expect(r.equivalent).toBe(2);
    expect(r.rate).toBeCloseTo(0.6667, 3);
  });

  it('lista vazia não divide por zero', async () => {
    const r = await computeEquivalenceRate([], async () => true);
    expect(r.rate).toBe(0);
  });
});
