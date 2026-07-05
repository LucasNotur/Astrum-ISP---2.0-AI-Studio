import { describe, it, expect } from 'vitest';
import { evaluateFinalGate, FINAL_CRITERIA, type FinalGateSignals } from './final-gate';

const allGreen: FinalGateSignals = {
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

describe('evaluateFinalGate (GATE FINAL S98)', () => {
  it('aprova a Astrum como AI Engine setorial quando os 10 critérios batem', () => {
    const r = evaluateFinalGate(allGreen);
    expect(r.approved).toBe(true);
    expect(r.score).toBe('10/10');
    expect(r.pending).toEqual([]);
  });

  it('nenhum sinal → 0/10, lista todos os pendentes', () => {
    const r = evaluateFinalGate({});
    expect(r.approved).toBe(false);
    expect(r.score).toBe('0/10');
    expect(r.pending).toHaveLength(10);
  });

  it('um critério pendente reprova o gate', () => {
    const r = evaluateFinalGate({ ...allGreen, zeroCobrancaJobsLost: false });
    expect(r.approved).toBe(false);
    expect(r.score).toBe('9/10');
    expect(r.pending).toContain('0% de jobs de cobrança perdidos');
  });

  it('há exatamente 10 critérios', () => {
    expect(FINAL_CRITERIA).toHaveLength(10);
  });
});
