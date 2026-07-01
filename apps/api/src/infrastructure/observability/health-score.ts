/**
 * Health Score — sonda sintética + score de saúde por ISP. Plano Mestre V2, S88.
 * Puro e testável. Alimenta o dashboard de saúde por ISP (dossiê itens 85, 26).
 */

export interface SyntheticProbeResult {
  reachedLlm: boolean;
  reachedRag: boolean;
  sentWhatsapp: boolean;
  latencyMs: number;
}

/** Avalia uma sonda sintética E2E: passou se completou o fluxo dentro do SLA de latência. */
export function evaluateProbe(r: SyntheticProbeResult, maxLatencyMs = 5000): { healthy: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!r.reachedLlm) reasons.push('llm_unreachable');
  if (!r.reachedRag) reasons.push('rag_unreachable');
  if (!r.sentWhatsapp) reasons.push('whatsapp_send_failed');
  if (r.latencyMs > maxLatencyMs) reasons.push('latency_exceeded');
  return { healthy: reasons.length === 0, reasons };
}

export interface IspHealthInputs {
  queueBacklog: number;        // jobs esperando
  whatsappConnected: boolean;
  autonomousResolutionRate: number; // 0–1
  errorRate: number;           // 0–1
  probeHealthy: boolean;
}

export type HealthStatus = 'healthy' | 'degraded' | 'critical';

/**
 * Score de saúde 0–100 por ISP e status. Combina fila, WhatsApp, resolução e erros.
 * Determinístico e explicável.
 */
export function computeIspHealth(i: IspHealthInputs): { score: number; status: HealthStatus } {
  let score = 100;
  if (!i.whatsappConnected) score -= 40;
  if (!i.probeHealthy) score -= 25;
  if (i.queueBacklog > 100) score -= 15;
  else if (i.queueBacklog > 20) score -= 5;
  score -= Math.round(i.errorRate * 100 * 0.5);          // até -50 se 100% erro
  score -= Math.round((1 - i.autonomousResolutionRate) * 10); // resolução baixa penaliza pouco

  score = Math.max(0, Math.min(100, score));
  const status: HealthStatus = score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'critical';
  return { score, status };
}
