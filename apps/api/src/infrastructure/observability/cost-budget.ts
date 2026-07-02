/**
 * Cost Budget + Performance — hardening final. Plano Mestre V2, S97. Puro e testável.
 * Alerta de estouro de orçamento de IA por tenant (portado do conceito llm_budget_usd
 * do cobraiWorker legado) e avaliação de metas de performance do CHECKLIST_MASTER.
 */

export interface TenantCostState {
  spentUsd: number;
  budgetUsd: number;
}

export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

/** Status do orçamento: warning a 80%, exceeded acima de 100%. */
export function budgetStatus(s: TenantCostState): BudgetStatus {
  if (s.budgetUsd <= 0) return 'ok';
  const ratio = s.spentUsd / s.budgetUsd;
  if (ratio >= 1) return 'exceeded';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
}

/** Deve pausar a IA (fail-safe de custo) quando estourou E o tenant optou por hard-stop. */
export function shouldPauseAi(s: TenantCostState, hardStop: boolean): boolean {
  return hardStop && budgetStatus(s) === 'exceeded';
}

export interface PerfTargets {
  lighthousePerf: number;   // meta >= 85
  lighthouseA11y: number;   // meta >= 90
  p95Ms: number;            // meta < 1500
}

export interface PerfVerdict { passed: boolean; failures: string[]; }

export function evaluatePerformance(t: PerfTargets): PerfVerdict {
  const failures: string[] = [];
  if (t.lighthousePerf < 85) failures.push(`lighthouse perf ${t.lighthousePerf} < 85`);
  if (t.lighthouseA11y < 90) failures.push(`lighthouse a11y ${t.lighthouseA11y} < 90`);
  if (t.p95Ms >= 1500) failures.push(`p95 ${t.p95Ms}ms >= 1500ms`);
  return { passed: failures.length === 0, failures };
}
