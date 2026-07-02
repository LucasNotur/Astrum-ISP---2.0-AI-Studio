import { describe, it, expect } from 'vitest';
import { median, benchmarkMetric, buildAnatelReport, type IspMetrics } from './benchmarking';

describe('median', () => {
  it('ímpar', () => expect(median([3, 1, 2])).toBe(2));
  it('par', () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it('vazio → 0', () => expect(median([])).toBe(0));
});

const target: IspMetrics = { tenantId: 't0', sizeTier: 'small', churnRate: 0.05, avgResolutionMin: 30, nps: 40 };
const peers: IspMetrics[] = [
  { tenantId: 't1', sizeTier: 'small', churnRate: 0.02, avgResolutionMin: 20, nps: 60 },
  { tenantId: 't2', sizeTier: 'small', churnRate: 0.03, avgResolutionMin: 25, nps: 55 },
  { tenantId: 't3', sizeTier: 'large', churnRate: 0.01, avgResolutionMin: 10, nps: 80 }, // porte diferente: ignorado
];

describe('benchmarkMetric', () => {
  it('compara só contra pares do mesmo porte', () => {
    const r = benchmarkMetric(target, peers, 'churnRate', true);
    expect(r.peerMedian).toBe(0.025); // mediana de t1,t2 (small)
    expect(r.betterThanPeers).toBe(false); // churn 0.05 > 0.025 → pior
    expect(r.deltaPct).toBe(100); // 100% acima da mediana
  });

  it('nps: maior é melhor', () => {
    const r = benchmarkMetric(target, peers, 'nps', false);
    expect(r.betterThanPeers).toBe(false); // 40 < mediana(55,60)=57.5
  });

  it('ISP melhor que os pares', () => {
    const good = { ...target, churnRate: 0.01 };
    expect(benchmarkMetric(good, peers, 'churnRate', true).betterThanPeers).toBe(true);
  });
});

describe('buildAnatelReport', () => {
  it('conforme quando resolução alta e reabertura baixa', () => {
    const r = buildAnatelReport({ totalTickets: 100, resolvedWithin48h: 95, totalComplaints: 100, reopenedComplaints: 5 });
    expect(r.taxaResolucao48h).toBeCloseTo(0.95, 5);
    expect(r.conforme).toBe(true);
  });

  it('não conforme se resolução abaixo do piso', () => {
    const r = buildAnatelReport({ totalTickets: 100, resolvedWithin48h: 80, totalComplaints: 100, reopenedComplaints: 5 });
    expect(r.conforme).toBe(false);
  });

  it('não conforme se reabertura alta', () => {
    const r = buildAnatelReport({ totalTickets: 100, resolvedWithin48h: 95, totalComplaints: 100, reopenedComplaints: 20 });
    expect(r.conforme).toBe(false);
  });
});
