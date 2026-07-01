/**
 * RAGAS + LLM-as-a-Judge — métricas de qualidade do RAG e calibração do router.
 * Plano Mestre V2, S87. As chamadas de LLM (judge) são injetáveis → testável.
 */

export interface RagSample {
  question: string;
  answer: string;
  contexts: string[];
  groundTruth?: string;
}

/**
 * Context Precision (proxy): fração dos contextos recuperados que o judge considera
 * relevantes para a pergunta. `judge` é injetável (LLM em prod).
 */
export async function contextPrecision(
  sample: RagSample,
  judge: (question: string, context: string) => Promise<boolean>,
): Promise<number> {
  if (sample.contexts.length === 0) return 0;
  let relevant = 0;
  for (const c of sample.contexts) {
    if (await judge(sample.question, c)) relevant++;
  }
  return relevant / sample.contexts.length;
}

/** Faithfulness (proxy): a resposta é sustentada pelos contextos? (judge injetável) */
export async function faithfulness(
  sample: RagSample,
  judge: (answer: string, contexts: string[]) => Promise<boolean>,
): Promise<number> {
  return (await judge(sample.answer, sample.contexts)) ? 1 : 0;
}

/** Agrega o score RAGAS de um test set e decide se passa o gate (>= 0.75). */
export function ragasGate(scores: number[], threshold = 0.75): { avg: number; passed: boolean } {
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return { avg, passed: avg >= threshold };
}

// ─── Calibração do LLM Router ────────────────────────────────────────────────

export interface IntentStat {
  intent: string;
  total: number;
  neededReasoning: number; // quantas exigiram raciocínio (gpt-4o) de fato
}

/**
 * Calibra o router com dados reais: um intent deve ir para o modelo caro (4o) só se
 * a fração que realmente exigiu raciocínio passar do limiar; senão, 4o-mini.
 */
export function calibrateRouter(stats: IntentStat[], reasoningThreshold = 0.3): Record<string, 'gpt-4o' | 'gpt-4o-mini'> {
  const routing: Record<string, 'gpt-4o' | 'gpt-4o-mini'> = {};
  for (const s of stats) {
    const ratio = s.total === 0 ? 0 : s.neededReasoning / s.total;
    routing[s.intent] = ratio >= reasoningThreshold ? 'gpt-4o' : 'gpt-4o-mini';
  }
  return routing;
}
