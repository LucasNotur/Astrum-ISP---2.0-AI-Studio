/**
 * E-04 — GATE DE EVAL: nada é promovido sem vencer o baseline na prova (IA-42).
 *
 * Regra RE1 do PLANO_E: "eval é o juiz — sem exceção". Este serviço é o juiz
 * de plantão: lê o baseline + o resultado mais recente do eval e responde
 * PODE/NÃO PODE promover. Toda ação de promoção do cérebro noturno (E-03) e,
 * futuramente, promoções de prompt/variante/fine-tune passam por aqui.
 *
 * Puro sobre arquivos do eval harness (apps/api/eval) — sem banco, sem LLM.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareToBaseline,
  type Baseline,
  type EvalResult,
  type SpecComparison,
} from '../../../../eval/spec-tracker';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = join(__dirname, '..', '..', '..', '..', 'eval');

export interface EvalGateStatus {
  allowed: boolean;
  reason: string;
  baselineRate: number | null;
  latestRate: number | null;
  latestResultAt: string | null;
  comparison: SpecComparison | null;
}

export function loadBaseline(evalDir: string = EVAL_DIR): Baseline | null {
  const p = join(evalDir, 'baseline.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as Baseline;
}

export function loadLatestResult(evalDir: string = EVAL_DIR): (EvalResult & { generatedAt?: string }) | null {
  const dir = join(evalDir, 'results');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const latest = files[files.length - 1];
  if (!latest) return null;
  return JSON.parse(readFileSync(join(dir, latest), 'utf8'));
}

/**
 * O veredito do juiz. Sem baseline ou sem resultado = NÃO PODE (fail-closed:
 * na dúvida, o gate fecha — promover sem prova é exatamente o que o RE1 proíbe).
 */
export function checkEvalGate(
  baseline: Baseline | null = loadBaseline(),
  latest: (EvalResult & { generatedAt?: string }) | null = loadLatestResult(),
): EvalGateStatus {
  if (!baseline) {
    return { allowed: false, reason: 'Sem baseline.json — rode o eval e congele um baseline antes de promover.', baselineRate: null, latestRate: null, latestResultAt: null, comparison: null };
  }
  if (!latest) {
    return { allowed: false, reason: 'Nenhum resultado de eval encontrado — rode npm run eval:agent.', baselineRate: baseline.rate, latestRate: null, latestResultAt: null, comparison: null };
  }
  const comparison = compareToBaseline(latest, baseline);
  return {
    allowed: comparison.gatePass,
    reason: comparison.gatePass
      ? `Gate ABERTO: pass-rate ${latest.passRate}% (baseline ${baseline.rate}%), ${comparison.regressions.length} regressões.`
      : `Gate FECHADO: ${comparison.regressions.length} regressões vs baseline (${comparison.regressions.slice(0, 5).join(', ')}${comparison.regressions.length > 5 ? '…' : ''}).`,
    baselineRate: baseline.rate,
    latestRate: latest.passRate,
    latestResultAt: latest.generatedAt ?? null,
    comparison,
  };
}

/** Lança se o gate estiver fechado — para usar em qualquer fluxo de promoção. */
export function assertPromotionAllowed(status: EvalGateStatus = checkEvalGate()): void {
  if (!status.allowed) throw new Error(`E-04 eval-gate: promoção bloqueada — ${status.reason}`);
}
