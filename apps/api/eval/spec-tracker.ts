/**
 * spec-tracker.ts — IA-42
 * -----------------------
 * Compara resultado de eval corrente com baseline versionado.
 * Gate: falha se pass-rate cai >2pp OU cenário que passava agora falha.
 * Cenários quarantined são excluídos do gate (listados no summary).
 */

export interface Baseline {
  rate: number;
  scenarios: Record<string, boolean>;
}

export interface EvalRow {
  id: string;
  passed: boolean;
}

export interface EvalResult {
  passRate: number;
  rows: EvalRow[];
  quarantined?: string[];
}

export interface SpecComparison {
  regressions: string[];
  newPasses: string[];
  rateDelta: number;
  gatePass: boolean;
}

const MAX_RATE_DROP_PP = 2;

export function compareToBaseline(
  current: EvalResult,
  baseline: Baseline,
): SpecComparison {
  const quarantineSet = new Set(current.quarantined ?? []);

  const regressions: string[] = [];
  const newPasses: string[] = [];

  const currentMap = new Map(current.rows.map((r) => [r.id, r.passed]));

  for (const [id, baselinePass] of Object.entries(baseline.scenarios)) {
    if (quarantineSet.has(id)) continue;
    const currentPass = currentMap.get(id);
    if (currentPass === undefined) continue;

    if (baselinePass && !currentPass) {
      regressions.push(id);
    } else if (!baselinePass && currentPass) {
      newPasses.push(id);
    }
  }

  const activeBaseline = Object.entries(baseline.scenarios)
    .filter(([id]) => !quarantineSet.has(id));
  const activeBaselineRate = activeBaseline.length === 0
    ? 0
    : (activeBaseline.filter(([, p]) => p).length / activeBaseline.length) * 100;

  const activeRows = current.rows.filter((r) => !quarantineSet.has(r.id));
  const activeCurrentRate = activeRows.length === 0
    ? 0
    : (activeRows.filter((r) => r.passed).length / activeRows.length) * 100;

  const rateDelta = activeCurrentRate - activeBaselineRate;

  const gatePass = regressions.length === 0 && rateDelta >= -MAX_RATE_DROP_PP;

  return { regressions, newPasses, rateDelta, gatePass };
}

export function formatSummary(
  comparison: SpecComparison,
  current: EvalResult,
  baseline: Baseline,
  mode: string,
): string {
  const lines: string[] = [
    '## IA-42 Spec Tracker — Nightly Gate',
    '',
    `- **Mode:** \`${mode}\``,
    `- **Pass rate:** ${current.passRate.toFixed(2)}% (${current.rows.filter((r) => r.passed).length}/${current.rows.length})`,
    `- **Baseline rate:** ${baseline.rate.toFixed(2)}%`,
    `- **Rate delta:** ${comparison.rateDelta >= 0 ? '+' : ''}${comparison.rateDelta.toFixed(2)}pp`,
    `- **Quarantined:** ${(current.quarantined ?? []).length}`,
    `- **Regressions:** ${comparison.regressions.length}`,
    `- **New passes:** ${comparison.newPasses.length}`,
    `- **Gate:** ${comparison.gatePass ? '✅ PASS' : '❌ FAIL'}`,
    '',
  ];

  if (comparison.regressions.length > 0) {
    lines.push('### Regressions');
    for (const id of comparison.regressions) {
      lines.push(`- \`${id}\``);
    }
    lines.push('');
  }

  if (comparison.newPasses.length > 0) {
    lines.push('### New passes');
    for (const id of comparison.newPasses) {
      lines.push(`- \`${id}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}
