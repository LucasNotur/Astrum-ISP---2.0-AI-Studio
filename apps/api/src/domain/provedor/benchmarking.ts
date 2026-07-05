/**
 * Benchmarking setorial + relatórios ANATEL. Plano Mestre V2, S96 (módulo novo).
 * Puro e testável. Compara um ISP contra a mediana anônima do setor (mesmo porte) e
 * gera indicadores regulatórios (proxy RQUAL/SICI).
 */

export interface IspMetrics {
  tenantId: string;
  sizeTier: 'small' | 'medium' | 'large';
  churnRate: number;         // 0–1
  avgResolutionMin: number;
  nps: number;               // -100..100
}

/** Mediana de um array numérico. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface BenchmarkResult {
  metric: string;
  value: number;
  peerMedian: number;
  deltaPct: number;          // quanto o ISP está acima(+)/abaixo(-) da mediana
  betterThanPeers: boolean;  // considerando a direção "boa" da métrica
}

/**
 * Compara o ISP-alvo contra os pares do MESMO porte (anonimizado — só a mediana sai).
 * `lowerIsBetter` indica métricas onde menor é melhor (churn, tempo de resolução).
 */
export function benchmarkMetric(
  target: IspMetrics,
  peers: IspMetrics[],
  metric: 'churnRate' | 'avgResolutionMin' | 'nps',
  lowerIsBetter: boolean,
): BenchmarkResult {
  const samePeers = peers.filter((p) => p.sizeTier === target.sizeTier && p.tenantId !== target.tenantId);
  const peerMedian = median(samePeers.map((p) => p[metric]));
  const value = target[metric];
  const deltaPct = peerMedian === 0 ? 0 : Math.round(((value - peerMedian) / Math.abs(peerMedian)) * 100);
  const betterThanPeers = lowerIsBetter ? value < peerMedian : value > peerMedian;
  return { metric, value, peerMedian, deltaPct, betterThanPeers };
}

// ─── Indicadores ANATEL (proxy) ──────────────────────────────────────────────

export interface AnatelInputs {
  totalTickets: number;
  resolvedWithin48h: number;
  totalComplaints: number;
  reopenedComplaints: number;
}

export interface AnatelReport {
  taxaResolucao48h: number;   // % resolvidos em 48h (indicador de qualidade)
  taxaReabertura: number;     // % reabertos (quanto menor melhor)
  conforme: boolean;          // atende o piso regulatório proxy
}

export function buildAnatelReport(i: AnatelInputs, minResolution48h = 0.9, maxReopen = 0.1): AnatelReport {
  const taxaResolucao48h = i.totalTickets === 0 ? 0 : i.resolvedWithin48h / i.totalTickets;
  const taxaReabertura = i.totalComplaints === 0 ? 0 : i.reopenedComplaints / i.totalComplaints;
  return {
    taxaResolucao48h,
    taxaReabertura,
    conforme: taxaResolucao48h >= minResolution48h && taxaReabertura <= maxReopen,
  };
}
