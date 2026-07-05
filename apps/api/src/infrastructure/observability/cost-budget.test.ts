import { describe, it, expect } from 'vitest';
import { budgetStatus, shouldPauseAi, evaluatePerformance } from './cost-budget';

describe('budgetStatus', () => {
  it('ok abaixo de 80%', () => expect(budgetStatus({ spentUsd: 40, budgetUsd: 100 })).toBe('ok'));
  it('warning a partir de 80%', () => expect(budgetStatus({ spentUsd: 85, budgetUsd: 100 })).toBe('warning'));
  it('exceeded a partir de 100%', () => expect(budgetStatus({ spentUsd: 100, budgetUsd: 100 })).toBe('exceeded'));
  it('orçamento zero → ok (sem limite)', () => expect(budgetStatus({ spentUsd: 999, budgetUsd: 0 })).toBe('ok'));
});

describe('shouldPauseAi', () => {
  it('pausa só se estourou E hard-stop ligado', () => {
    expect(shouldPauseAi({ spentUsd: 120, budgetUsd: 100 }, true)).toBe(true);
    expect(shouldPauseAi({ spentUsd: 120, budgetUsd: 100 }, false)).toBe(false);
    expect(shouldPauseAi({ spentUsd: 50, budgetUsd: 100 }, true)).toBe(false);
  });
});

describe('evaluatePerformance', () => {
  it('passa quando todas as metas batem', () => {
    expect(evaluatePerformance({ lighthousePerf: 90, lighthouseA11y: 95, p95Ms: 1200 }).passed).toBe(true);
  });
  it('acusa cada meta furada', () => {
    const v = evaluatePerformance({ lighthousePerf: 70, lighthouseA11y: 80, p95Ms: 2000 });
    expect(v.passed).toBe(false);
    expect(v.failures).toHaveLength(3);
  });
});
