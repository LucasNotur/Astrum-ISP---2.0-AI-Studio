import { describe, it, expect } from 'vitest';
import { evaluateFinalGate, type FinalGateSignals } from './final-gate';

describe('collect-signals integration with evaluateFinalGate', () => {
  it('sinais parciais retornam score correto e listam pendentes', () => {
    const partial: Partial<FinalGateSignals> = {
      absoluteTenantIsolation: true,
      docsComplete: true,
      zeroCobrancaJobsLost: true,
    };

    const result = evaluateFinalGate(partial);
    expect(result.score).toBe('3/10');
    expect(result.approved).toBe(false);
    expect(result.passed).toHaveLength(3);
    expect(result.pending).toHaveLength(7);
  });

  it('todos os sinais verdadeiros aprovam o gate', () => {
    const all: FinalGateSignals = {
      tenISPsParallel: true,
      legacyWorkersIntegrated: true,
      autonomousResolutionOver80: true,
      zeroCobrancaJobsLost: true,
      absoluteTenantIsolation: true,
      realtimeCostPerISP: true,
      deployUnder5MinZeroDowntime: true,
      ragasAutomatedPerDeploy: true,
      docsComplete: true,
      syntheticMonitoring247: true,
    };

    const result = evaluateFinalGate(all);
    expect(result.approved).toBe(true);
    expect(result.score).toBe('10/10');
  });

  it('sinais undefined contam como pendentes', () => {
    const result = evaluateFinalGate({});
    expect(result.score).toBe('0/10');
    expect(result.pending).toHaveLength(10);
  });
});
