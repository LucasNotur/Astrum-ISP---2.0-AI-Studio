/**
 * Load & Chaos Analysis — helpers puros para avaliar os resultados dos testes de
 * carga (K6) e de caos. Plano Mestre V2, S84. O disparo real do K6 é operacional;
 * a AVALIAÇÃO dos números (que decide passa/falha) é testável aqui.
 */

export interface LoadMetrics {
  latenciesMs: number[];
  jobsEnqueued: number;
  jobsProcessed: number;
  errors: number;
}

/** Percentil (nearest-rank). p em [0,100]. */
export function percentile(latencies: number[], p: number): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1];
}

export interface LoadVerdict {
  p95: number;
  jobLossRate: number;      // (enfileirados - processados) / enfileirados
  errorRate: number;
  passed: boolean;
  reasons: string[];
}

export interface LoadThresholds {
  p95MaxMs: number;         // meta: 1500
  maxJobLossRate: number;   // meta: 0 (Outbox+DLQ)
  maxErrorRate: number;     // meta pequeno
}

export const DEFAULT_THRESHOLDS: LoadThresholds = { p95MaxMs: 1500, maxJobLossRate: 0, maxErrorRate: 0.01 };

export function evaluateLoad(m: LoadMetrics, t: LoadThresholds = DEFAULT_THRESHOLDS): LoadVerdict {
  const p95 = percentile(m.latenciesMs, 95);
  const jobLossRate = m.jobsEnqueued === 0 ? 0 : (m.jobsEnqueued - m.jobsProcessed) / m.jobsEnqueued;
  const totalReq = m.latenciesMs.length || 1;
  const errorRate = m.errors / totalReq;

  const reasons: string[] = [];
  if (p95 > t.p95MaxMs) reasons.push(`p95 ${p95}ms > ${t.p95MaxMs}ms`);
  if (jobLossRate > t.maxJobLossRate) reasons.push(`perda de jobs ${(jobLossRate * 100).toFixed(2)}% > ${t.maxJobLossRate * 100}%`);
  if (errorRate > t.maxErrorRate) reasons.push(`erro ${(errorRate * 100).toFixed(2)}% > ${(t.maxErrorRate * 100).toFixed(2)}%`);

  return { p95, jobLossRate, errorRate, passed: reasons.length === 0, reasons };
}

/** Chaos: dado o serviço derrubado, o sistema deve degradar sem PERDER mensagem. */
export function chaosDegradesGracefully(result: {
  serviceDown: string;
  messagesLost: number;
  failOpenTriggered: boolean;
}): boolean {
  // Regra dura: zero mensagem perdida, e o fail-open/fallback foi acionado.
  return result.messagesLost === 0 && result.failOpenTriggered;
}
