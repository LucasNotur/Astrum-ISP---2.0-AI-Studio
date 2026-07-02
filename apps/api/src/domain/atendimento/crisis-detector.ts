/**
 * Crisis Detector — detecta crise massiva (queda de backbone/CTO) por pico de
 * mensagens agrupadas por região. Plano Mestre V2, S92 (dossiê item 94). Puro.
 *
 * Quando muitos clientes da mesma região reclamam em janela curta, é incidente de
 * rede, não N atendimentos individuais: agrupa, responde em massa e suprime SLA/cobrança.
 */

export interface IncomingComplaint {
  customerId: string;
  region: string;       // CTO/bairro/região
  timestamp: number;    // epoch ms
}

export interface CrisisConfig {
  windowMs: number;        // janela deslizante (ex.: 5min)
  minComplaints: number;   // gatilho (ex.: 10 na mesma região)
}

export const DEFAULT_CRISIS: CrisisConfig = { windowMs: 5 * 60_000, minComplaints: 10 };

export interface DetectedCrisis {
  region: string;
  count: number;
  customerIds: string[];
  since: number;
}

/**
 * Analisa as reclamações dentro da janela e retorna as regiões em crise.
 * `now` injetável para teste.
 */
export function detectCrises(
  complaints: IncomingComplaint[],
  config: CrisisConfig = DEFAULT_CRISIS,
  now: number = Date.now(),
): DetectedCrisis[] {
  const windowStart = now - config.windowMs;
  const byRegion = new Map<string, IncomingComplaint[]>();

  for (const c of complaints) {
    if (c.timestamp < windowStart || c.timestamp > now) continue;
    const arr = byRegion.get(c.region) ?? [];
    arr.push(c);
    byRegion.set(c.region, arr);
  }

  const crises: DetectedCrisis[] = [];
  for (const [region, arr] of byRegion) {
    // clientes distintos (o mesmo cliente mandando 5 msgs não é 5 reclamações)
    const uniqueCustomers = [...new Set(arr.map((c) => c.customerId))];
    if (uniqueCustomers.length >= config.minComplaints) {
      crises.push({
        region,
        count: uniqueCustomers.length,
        customerIds: uniqueCustomers,
        since: Math.min(...arr.map((c) => c.timestamp)),
      });
    }
  }
  return crises.sort((a, b) => b.count - a.count);
}

/**
 * Decide o que suprimir durante uma crise: não escalar SLA nem cobrar clientes
 * afetados pelo período do incidente (senão a IA pune o cliente por falha do ISP).
 */
export function crisisSuppressions(crisis: DetectedCrisis): {
  suppressSla: boolean;
  suppressCobranca: boolean;
  affectedCustomers: string[];
} {
  return {
    suppressSla: true,
    suppressCobranca: true,
    affectedCustomers: crisis.customerIds,
  };
}
