import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareToBaseline,
  formatSummary,
  type Baseline,
  type EvalResult,
} from './spec-tracker.js';

/**
 * eval/run-eval.ts — IA-03
 * ------------------------
 * Runner da suite de eval de atendimento. Lê `eval/scenarios/atendimento.jsonl`
 * (50 cenários) e avalia asserts determinísticos em três modos:
 *
 *  - MOCK   (default):         valida integridade dos fixtures + categorias. Sem LLM.
 *  - ONLINE (EVAL_ONLINE=true): roda `langGraphService.processMessage` por cenário
 *                               (requer OPENAI_API_KEY + infra real); avalia
 *                               must_contain/not_contain/requires_human_expected.
 *  - JUDGE  (EVAL_JUDGE=true):  implica ONLINE + chama `judge.ts` (gpt-4o-mini)
 *                               para score 1-5. Requer OPENAI_API_KEY.
 *
 * Saída: tabela no stdout + arquivo JSON em `eval/results/<timestamp>.json`.
 * Exit code 1 se pass-rate < 90% (modo online/judge) ou < 100% (modo mock —
 * fixtures mal-formados são bloqueadores).
 *
 * Executar:
 *   pnpm --filter @astrum/api run eval:agent
 *   EVAL_ONLINE=true pnpm --filter @astrum/api run eval:agent
 *   EVAL_ONLINE=true EVAL_JUDGE=true pnpm --filter @astrum/api run eval:agent
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_PATH = join(__dirname, 'scenarios', 'atendimento.jsonl');
const RESULTS_DIR = join(__dirname, 'results');
const BASELINE_PATH = join(__dirname, 'baseline.json');

const EVAL_TENANT_ID = process.env.EVAL_TENANT_ID ?? '00000000-0000-0000-0000-000000000000';
const ECONVERSATION_SEQ = '00000000-0000-4000-8000-000000000000';

const VALID_INTENTS = new Set([
  'support_technical',
  'support_billing',
  'upgrade_plan',
  'cancel_service',
  'check_status',
  'complaint',
  'other',
]);

interface Scenario {
  id: string;
  userMessage: string;
  intent_expected?: string;
  must_contain?: string[];
  must_not_contain?: string[];
  requires_human_expected?: boolean;
  quarantined?: boolean;
}

interface ScenarioResult {
  id: string;
  passed: boolean;
  failures: string[];
  response?: string;
  requiresHuman?: boolean;
  judge?: { score_1a5: number; rationale: string } | { error: string } | null;
  durationMs?: number;
}

function loadScenarios(): Scenario[] {
  const lines = readFileSync(SCENARIOS_PATH, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const out: Scenario[] = [];
  lines.forEach((l, i) => {
    try {
      const obj = JSON.parse(l);
      out.push(obj as Scenario);
    } catch (e) {
      throw new Error(
        `scenario line ${i + 1}: invalid JSON — ${(e as Error).message}`,
      );
    }
  });
  return out;
}

function validateFixture(s: Scenario): { ok: boolean; reason?: string } {
  if (!s.id || typeof s.id !== 'string') return { ok: false, reason: 'id missing' };
  if (typeof s.userMessage !== 'string') return { ok: false, reason: 'userMessage missing (string)' };
  if (s.intent_expected !== undefined && !VALID_INTENTS.has(s.intent_expected)) {
    return { ok: false, reason: `intent_expected invalid: ${s.intent_expected}` };
  }
  if (s.must_contain !== undefined && !Array.isArray(s.must_contain)) {
    return { ok: false, reason: 'must_contain must be array' };
  }
  if (s.must_not_contain !== undefined && !Array.isArray(s.must_not_contain)) {
    return { ok: false, reason: 'must_not_contain must be array' };
  }
  if (
    s.requires_human_expected !== undefined &&
    typeof s.requires_human_expected !== 'boolean'
  ) {
    return { ok: false, reason: 'requires_human_expected must be boolean' };
  }
  return { ok: true };
}

function evaluateDeterministic(
  s: Scenario,
  actual: { response: string; requiresHuman: boolean },
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  const resp = (actual.response ?? '').toLowerCase();
  for (const mc of s.must_contain ?? []) {
    if (!resp.includes(String(mc).toLowerCase())) {
      failures.push(`must_contain missing: "${mc}"`);
    }
  }
  for (const mnc of s.must_not_contain ?? []) {
    if (resp.includes(String(mnc).toLowerCase())) {
      failures.push(`must_not_contain present: "${mnc}"`);
    }
  }
  if (
    s.requires_human_expected !== undefined &&
    s.requires_human_expected !== actual.requiresHuman
  ) {
    failures.push(
      `requiresHuman expected=${s.requires_human_expected} actual=${actual.requiresHuman}`,
    );
  }
  return { passed: failures.length === 0, failures };
}

function printTable(rows: ScenarioResult[]): void {
  const pad = (v: string, n: number) => v + ' '.repeat(Math.max(0, n - v.length));
  const header = pad('ID', 14) + pad('PASS', 6) + pad('FAIL', 6) + 'Note';
  console.log('-'.repeat(header.length));
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const r of rows) {
    const note =
      r.failures.length > 0
        ? r.failures[0].slice(0, 60)
        : r.judge && 'score_1a5' in r.judge
        ? `judge=${r.judge.score_1a5}/5`
        : r.judge && 'error' in r.judge
        ? 'judge error'
        : 'ok';
    console.log(
      pad(r.id, 14) +
        pad(r.passed ? 'YES' : 'NO', 6) +
        pad(String(r.failures.length), 6) +
        note,
    );
  }
  console.log('-'.repeat(header.length));
}

async function main() {
  const ciMode = process.argv.includes('--ci');
  const online = ciMode || (process.env.EVAL_ONLINE ?? '').trim().toLowerCase() === 'true';
  const withJudge = (process.env.EVAL_JUDGE ?? '').trim().toLowerCase() === 'true';
  if (withJudge && !online) {
    console.error('EVAL_JUDGE=true implica EVAL_ONLINE=true. Configure ambos.');
    process.exit(2);
  }

  const scenarios = loadScenarios();
  const quarantinedIds = scenarios.filter((s) => s.quarantined).map((s) => s.id);
  const mode = withJudge ? 'judge' : online ? 'online' : 'mock';
  console.log(`\n[eval] modo=${mode}${ciMode ? ' (CI gate)' : ''} cenários=${scenarios.length} quarentena=${quarantinedIds.length} tenant=${EVAL_TENANT_ID}\n`);

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  // LLM-as-judge import (lazily) accordingly to mode.
  const judgeMod = withJudge ? await import('./judge.js') : null;

  // LangGraph service import — only needed in online/judge modes.
  let langGraphService: {
    processMessage(input: {
      tenantId: string;
      customerId: string;
      conversationId: string;
      userMessage: string;
    }): Promise<{ response: string; steps: string[]; requiresHuman: boolean }>;
  } | null = null;
  if (online) {
    const mod = await import('../src/domain/agent/langgraph.service.js');
    langGraphService = mod.langGraphService as any;
  }

  const rows: ScenarioResult[] = [];
  let convCounter = 0;

  for (const s of scenarios) {
    const fixture = validateFixture(s);

    if (mode === 'mock' || !online) {
      rows.push({
        id: s.id,
        passed: fixture.ok,
        failures: fixture.ok ? [] : [fixture.reason ?? 'invalid fixture'],
      });
      continue;
    }

    // Online / judge mode → real graph run.
    convCounter += 1;
    const conversationId = `${ECONVERSATION_SEQ.slice(0, -6)}${String(convCounter).padStart(6, '0').slice(-6)}`;
    const t0 = Date.now();
    let actual: { response: string; requiresHuman: boolean };
    try {
      const out = await langGraphService!.processMessage({
        tenantId: EVAL_TENANT_ID,
        customerId: EVAL_TENANT_ID,
        conversationId,
        userMessage: s.userMessage ?? '',
      });
      actual = {
        response: out.response,
        requiresHuman: out.requiresHuman,
      };
    } catch (e) {
      rows.push({
        id: s.id,
        passed: false,
        failures: [`run error: ${(e as Error).message.slice(0, 80)}`],
        durationMs: Date.now() - t0,
      });
      continue;
    }
    if (!fixture.ok) {
      rows.push({
        id: s.id,
        passed: false,
        failures: [fixture.reason ?? 'invalid fixture'],
        response: actual.response,
        requiresHuman: actual.requiresHuman,
        durationMs: Date.now() - t0,
      });
      continue;
    }
    const det = evaluateDeterministic(s, actual);
    const row: ScenarioResult = {
      id: s.id,
      passed: det.passed,
      failures: det.failures,
      response: actual.response,
      requiresHuman: actual.requiresHuman,
      durationMs: Date.now() - t0,
    };
    if (withJudge && judgeMod) {
      try {
        const jr = await judgeMod.judge(
          {
            scenarioId: s.id,
            userMessage: s.userMessage,
            response: actual.response,
            mustContain: s.must_contain ?? [],
            mustNotContain: s.must_not_contain ?? [],
            requiresHumanExpected: s.requires_human_expected,
            requiresHumanActual: actual.requiresHuman,
          },
          EVAL_TENANT_ID,
        );
        row.judge = jr;
        // Fail if judge score < 4 in judge-mode.
        if (jr.score_1a5 < 4) {
          row.passed = false;
          row.failures.push(`judge score < 4: ${jr.score_1a5}`);
        }
      } catch (e) {
        row.judge = { error: (e as Error).message.slice(0, 200) };
      }
    }
    rows.push(row);
  }

  printTable(rows);

  const passed = rows.filter((r) => r.passed).length;
  const total = rows.length;
  const passRate = total === 0 ? 0 : (passed / total) * 100;

  const threshold = online ? 90 : 100;
  console.log(
    `\n[eval] pass-rate=${passRate.toFixed(1)}% (${passed}/${total}) ` +
      `threshold=${threshold}% modo=${mode}\n`,
  );

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const resultPath = join(RESULTS_DIR, `${ts}.json`);
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        mode,
        generatedAt: new Date().toISOString(),
        total,
        passed,
        passRate,
        threshold,
        ok: passRate >= threshold,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(`[eval] resultados salvos em ${resultPath}`);

  // IA-42 — CI gate: compara com baseline versionado.
  if (ciMode) {
    if (!existsSync(BASELINE_PATH)) {
      console.error('[eval] ERRO: baseline.json não encontrado. Rode o eval e faça commit do baseline.');
      process.exit(2);
    }
    const baseline: Baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    const evalResult: EvalResult = { passRate, rows, quarantined: quarantinedIds };
    const comparison = compareToBaseline(evalResult, baseline);
    const summary = formatSummary(comparison, evalResult, baseline, mode);

    const summaryPath = resultPath.replace('.json', '.summary.md');
    writeFileSync(summaryPath, summary + '\n');
    console.log(`[eval] summary salvo em ${summaryPath}`);
    console.log('\n' + summary);

    if (!comparison.gatePass) {
      console.error(`\n[eval] ❌ GATE FALHOU — ${comparison.regressions.length} regressão(ões): ${comparison.regressions.join(', ')}`);
      process.exit(1);
    }
    console.log('\n[eval] ✅ Gate passou.');
    process.exit(0);
  }

  if (passRate < threshold) process.exit(1);
  process.exit(0);
}

main().catch((e) => {
  console.error('[eval] fatal:', e);
  process.exit(1);
});