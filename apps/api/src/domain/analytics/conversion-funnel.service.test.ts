import { describe, it, expect } from 'vitest';
import { buildFunnelReport, FunnelPorts, FunnelStage } from './conversion-funnel.service';

function makePorts(): FunnelPorts {
  const counts: Record<FunnelStage, number> = { lead: 100, trial: 60, active: 40, upgrade: 10, churn: 5 };
  return {
    getStageCount: async (_, stage) => counts[stage],
    getAvgConversionDays: async () => 12,
    getMonthlyStages: async () => [
      { month: '2026-06', leads: 50, actives: 20 },
      { month: '2026-07', leads: 50, actives: 20 },
    ],
  };
}

describe('conversion-funnel.service', () => {
  it('calcula conversão entre estágios', async () => {
    const report = await buildFunnelReport('t1', '2026-06-01', '2026-07-31', makePorts());
    expect(report.stages).toHaveLength(5);
    expect(report.stages[0].stage).toBe('lead');
    expect(report.stages[0].conversionFromPrevious).toBe(100);
    expect(report.stages[1].stage).toBe('trial');
    expect(report.stages[1].conversionFromPrevious).toBe(60);
    expect(report.stages[2].conversionFromPrevious).toBe(67);
  });

  it('calcula overall conversion lead→active', async () => {
    const report = await buildFunnelReport('t1', '2026-06-01', '2026-07-31', makePorts());
    expect(report.overallConversion).toBe(40);
  });

  it('inclui avg days to conversion', async () => {
    const report = await buildFunnelReport('t1', '2026-06-01', '2026-07-31', makePorts());
    expect(report.avgDaysLeadToActive).toBe(12);
  });

  it('calcula trend mensal com conversion', async () => {
    const report = await buildFunnelReport('t1', '2026-06-01', '2026-07-31', makePorts());
    expect(report.monthlyTrend).toHaveLength(2);
    expect(report.monthlyTrend[0].conversion).toBe(40);
  });

  it('lida com zero leads sem dividir por zero', async () => {
    const ports = makePorts();
    ports.getStageCount = async () => 0;
    ports.getMonthlyStages = async () => [{ month: '2026-07', leads: 0, actives: 0 }];
    const report = await buildFunnelReport('t1', '2026-07-01', '2026-07-31', ports);
    expect(report.overallConversion).toBe(0);
    expect(report.monthlyTrend[0].conversion).toBe(0);
  });
});
