export const BUDGETS_MS: Record<string, number> = {
  classify: 800,
  guardrails: 50,
  decide_source: 20,
  fetch_context: 1200,
  grade_context: 700,
  rewrite_query: 700,
  generate: 6000,
  self_check: 900,
  validate: 20,
  safety_veto: 900,
  escalate: 100,
  constitutional_review: 900,
};

export function isLatencyBudgetEnabled(): boolean {
  return (process.env.LATENCY_BUDGET_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export interface LatencyReport {
  node: string;
  p50: number;
  p95: number;
  budget: number;
  exceeded: boolean;
  count: number;
}

export function buildReport(
  data: { node: string; duration_ms: number }[],
): LatencyReport[] {
  const grouped = new Map<string, number[]>();
  for (const d of data) {
    const list = grouped.get(d.node) ?? [];
    list.push(d.duration_ms);
    grouped.set(d.node, list);
  }

  return [...grouped.entries()].map(([node, values]) => {
    const budget = BUDGETS_MS[node] ?? 1000;
    const p95 = percentile(values, 95);
    return {
      node,
      p50: percentile(values, 50),
      p95,
      budget,
      exceeded: p95 > budget * 1.2,
      count: values.length,
    };
  });
}
