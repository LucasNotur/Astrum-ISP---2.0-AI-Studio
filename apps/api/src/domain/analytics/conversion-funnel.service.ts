/**
 * Dossiê #86 — Dashboard de Conversões (Funil).
 * Modela o funil lead→trial→ativo→upgrade→churn com
 * taxas de conversão entre estágios e breakdown temporal.
 */

export type FunnelStage = 'lead' | 'trial' | 'active' | 'upgrade' | 'churn';

export interface FunnelStageData {
  stage: FunnelStage;
  count: number;
  conversionFromPrevious: number;
}

export interface FunnelReport {
  tenantId: string;
  period: { from: string; to: string };
  stages: FunnelStageData[];
  overallConversion: number;
  avgDaysLeadToActive: number;
  monthlyTrend: Array<{ month: string; leads: number; actives: number; conversion: number }>;
}

export interface FunnelPorts {
  getStageCount: (tenantId: string, stage: FunnelStage, from: string, to: string) => Promise<number>;
  getAvgConversionDays: (tenantId: string, from: string, to: string) => Promise<number>;
  getMonthlyStages: (tenantId: string, from: string, to: string) => Promise<Array<{ month: string; leads: number; actives: number }>>;
}

const FUNNEL_ORDER: FunnelStage[] = ['lead', 'trial', 'active', 'upgrade', 'churn'];

export async function buildFunnelReport(
  tenantId: string,
  from: string,
  to: string,
  ports: FunnelPorts,
): Promise<FunnelReport> {
  const counts = await Promise.all(
    FUNNEL_ORDER.map((stage) => ports.getStageCount(tenantId, stage, from, to)),
  );

  const stages: FunnelStageData[] = FUNNEL_ORDER.map((stage, i) => ({
    stage,
    count: counts[i],
    conversionFromPrevious: i === 0 || counts[i - 1] === 0
      ? 100
      : Math.round((counts[i] / counts[i - 1]) * 100),
  }));

  const leads = counts[0] || 1;
  const actives = counts[2];
  const overallConversion = Math.round((actives / leads) * 100);

  const avgDaysLeadToActive = await ports.getAvgConversionDays(tenantId, from, to);
  const monthlyRaw = await ports.getMonthlyStages(tenantId, from, to);

  const monthlyTrend = monthlyRaw.map((m) => ({
    ...m,
    conversion: m.leads > 0 ? Math.round((m.actives / m.leads) * 100) : 0,
  }));

  return { tenantId, period: { from, to }, stages, overallConversion, avgDaysLeadToActive, monthlyTrend };
}
