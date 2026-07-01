/**
 * Go-Live Gate — reavalia as North Star Metrics (CHECKLIST_MASTER) com dados REAIS
 * antes de autorizar o go-live. Plano Mestre V2, S86. Puro e testável.
 */

export interface NorthStarMetrics {
  autonomousResolutionRate: number; // meta > 0.80
  p95LatencyMs: number;             // meta < 1500
  costPerConversationBRL: number;   // meta: <= baseline * 0.4
  baselineCostBRL: number;
  jobsLostOnCrash: number;          // meta: 0
  crossTenantLeaks: number;         // meta: 0
  costVisibilityPerIsp: boolean;    // Helicone em tempo real
}

export interface GoLiveDecision {
  approved: boolean;
  blockers: string[];
  scorecard: Record<string, { value: number | boolean; target: string; pass: boolean }>;
}

export function evaluateGoLive(m: NorthStarMetrics): GoLiveDecision {
  const costTarget = m.baselineCostBRL * 0.4;
  const checks = {
    resolucao_autonoma: { value: m.autonomousResolutionRate, target: '> 0.80', pass: m.autonomousResolutionRate > 0.8 },
    latencia_p95: { value: m.p95LatencyMs, target: '< 1500ms', pass: m.p95LatencyMs < 1500 },
    custo_conversa: { value: m.costPerConversationBRL, target: `<= ${costTarget.toFixed(2)}`, pass: m.costPerConversationBRL <= costTarget },
    jobs_perdidos: { value: m.jobsLostOnCrash, target: '= 0', pass: m.jobsLostOnCrash === 0 },
    vazamento_cross_tenant: { value: m.crossTenantLeaks, target: '= 0', pass: m.crossTenantLeaks === 0 },
    custo_por_isp_visivel: { value: m.costVisibilityPerIsp, target: 'true', pass: m.costVisibilityPerIsp === true },
  };

  const blockers = Object.entries(checks).filter(([, c]) => !c.pass).map(([k]) => k);
  return { approved: blockers.length === 0, blockers, scorecard: checks };
}
