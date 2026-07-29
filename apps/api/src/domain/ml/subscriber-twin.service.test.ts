import { describe, it, expect, vi } from 'vitest';
import { simulateAction, simulateSegment, type SubscriberTwinPorts } from './subscriber-twin.service';

const makeDb = () => ({
  from: () => ({
    insert: (row: any) => ({ select: () => ({ single: () => ({ data: { id: 'sim-1' }, error: null }) }) }),
    select: () => ({
      eq: () => ({
        eq: () => ({
          gte: () => ({
            lte: () => ({ limit: () => ({ data: [{ id: 'c1' }, { id: 'c2' }], error: null }) }),
            limit: () => ({ data: [{ id: 'c1' }, { id: 'c2' }], error: null }),
          }),
          limit: () => ({ data: [{ id: 'c1' }, { id: 'c2' }], error: null }),
          status: 'active',
        }),
        limit: () => ({
          maybeSingle: () => ({ data: { score: 0.4 }, error: null }),
        }),
        maybeSingle: () => ({ data: { mrr: 6000 }, error: null }),
      }),
    }),
  }),
} as any);

const makePorts = (overrides: Partial<SubscriberTwinPorts> = {}): SubscriberTwinPorts => ({
  db: makeDb(),
  getChurnScore: vi.fn().mockResolvedValue(0.4),
  getLtv: vi.fn().mockResolvedValue(150_00),
  ...overrides,
});

describe('D-19 simulateAction', () => {
  it('price_change aumenta churn', async () => {
    const result = await simulateAction('ten-1', 'cust-1', 'price_change', { delta_cents: 1000 }, makePorts());
    expect(result.churnProbAfter).toBeGreaterThan(result.churnProbBefore);
    expect(result.simulationId).toBe('sim-1');
  });

  it('offer reduz churn', async () => {
    const result = await simulateAction('ten-1', 'cust-1', 'offer', { discount_pct: 15 }, makePorts());
    expect(result.churnProbAfter).toBeLessThan(result.churnProbBefore);
    expect(result.recommendation).toBe('proceed');
  });

  it('suspension = avoid para cliente com churn já alto', async () => {
    const ports = makePorts({ getChurnScore: vi.fn().mockResolvedValue(0.55) });
    const result = await simulateAction('ten-1', 'cust-1', 'suspension', {}, ports);
    expect(result.recommendation).toBe('avoid');
  });

  it('contém nota de confiança', async () => {
    const result = await simulateAction('ten-1', 'cust-1', 'upgrade', {}, makePorts());
    expect(result.confidenceNote).toContain('heurísticas');
  });

  it('ltvImpactCents é negativo para ações que aumentam churn', async () => {
    const result = await simulateAction('ten-1', 'cust-1', 'price_change', { delta_cents: 2000 }, makePorts());
    expect(result.ltvImpactCents).toBeLessThan(0);
  });
});

describe('D-19 simulateSegment', () => {
  it('retorna segmentSize e resultado agregado', async () => {
    const ports = makePorts({
      db: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({ data: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], error: null }),
              }),
            }),
          }),
          insert: () => ({ select: () => ({ single: () => ({ data: { id: 'sim-seg-1' }, error: null }) }) }),
        }),
      } as any,
    });
    const result = await simulateSegment('ten-1', {}, 'offer', { discount_pct: 10 }, ports);
    expect(result.simulationId).toBeDefined();
    expect(result.segmentSize).toBeGreaterThan(0);
  });
});
