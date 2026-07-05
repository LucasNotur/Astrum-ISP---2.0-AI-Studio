import { describe, it, expect, vi } from 'vitest';
import { contextPrecision, faithfulness, ragasGate, calibrateRouter } from './ragas';

describe('contextPrecision', () => {
  it('fração de contextos relevantes segundo o judge', async () => {
    const judge = vi.fn(async (_q: string, c: string) => c.includes('relevante'));
    const p = await contextPrecision(
      { question: 'q', answer: 'a', contexts: ['relevante 1', 'lixo', 'relevante 2'] },
      judge,
    );
    expect(p).toBeCloseTo(2 / 3, 5);
  });

  it('sem contextos → 0', async () => {
    expect(await contextPrecision({ question: 'q', answer: 'a', contexts: [] }, async () => true)).toBe(0);
  });
});

describe('faithfulness', () => {
  it('1 se sustentado, 0 se não', async () => {
    expect(await faithfulness({ question: 'q', answer: 'a', contexts: ['c'] }, async () => true)).toBe(1);
    expect(await faithfulness({ question: 'q', answer: 'a', contexts: ['c'] }, async () => false)).toBe(0);
  });
});

describe('ragasGate', () => {
  it('passa com média >= 0.75', () => {
    expect(ragasGate([0.8, 0.9, 0.7])).toEqual({ avg: expect.closeTo(0.8, 5), passed: true });
  });
  it('falha abaixo do limiar', () => {
    expect(ragasGate([0.5, 0.6]).passed).toBe(false);
  });
  it('vazio → 0, não passa', () => {
    expect(ragasGate([])).toEqual({ avg: 0, passed: false });
  });
});

describe('calibrateRouter', () => {
  it('intent que raramente exige raciocínio vai para 4o-mini (economia)', () => {
    const r = calibrateRouter([
      { intent: 'segunda_via', total: 100, neededReasoning: 5 },   // 5% → mini
      { intent: 'reclamacao_complexa', total: 100, neededReasoning: 60 }, // 60% → 4o
    ]);
    expect(r.segunda_via).toBe('gpt-4o-mini');
    expect(r.reclamacao_complexa).toBe('gpt-4o');
  });

  it('no limiar (30%) escolhe 4o', () => {
    const r = calibrateRouter([{ intent: 'x', total: 10, neededReasoning: 3 }]);
    expect(r.x).toBe('gpt-4o');
  });
});
