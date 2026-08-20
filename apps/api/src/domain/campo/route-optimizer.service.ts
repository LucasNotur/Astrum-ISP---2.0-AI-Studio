/**
 * PLANO I (Uber do Técnico) — Fase I-2 — Otimizador de rota do dia (v1).
 *
 * Ordena as paradas do técnico para minimizar o KM rodado, partindo da base.
 * Heurística: vizinho-mais-próximo (constrói uma rota inicial gulosa) + 2-opt
 * (melhora desfazendo cruzamentos). Puro TypeScript, zero custo, zero dependência
 * externa — resolve bem os ≤15 paradas/dia típicos de um técnico. OSRM/Google
 * Routes ficam para a v2 (quando trânsito real importar).
 *
 * Rota tratada como CAMINHO ABERTO: começa na base e termina na última parada
 * (o técnico não volta para a base ao fim do dia).
 */
import { haversineKm } from './field-km.service';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface RouteStop extends GeoPoint {
  serviceOrderId: string;
  /** Urgência 0..1 (ex.: derivada do SLA). 0 = sem pressa. Opcional. */
  urgency?: number;
  /** "Fazer até" em minutos desde a meia-noite (de time_window_end/scheduled). */
  dueMinutes?: number;
  /** Duração estimada do atendimento em minutos (default 30). */
  serviceMinutes?: number;
}

export interface OptimizedRoute {
  order: RouteStop[];
  totalKm: number;
  algorithm: 'nearest_neighbor_2opt' | 'weighted_2opt';
}

// Parâmetros da função-objetivo ponderada. Km é a base; atraso na janela e
// urgência entram como penalidades em "km-equivalente" pra somar na mesma unidade.
const AVG_SPEED_KMH = 25;       // velocidade urbana média p/ estimar horário de chegada
const LATE_KM_PER_MIN = 0.8;    // cada minuto de atraso na janela ~ 0.8 km de penalidade
const URGENCY_KM_PER_MIN = 0.15; // adiar 1 min uma OS urgente ~ 0.15 km * urgência

/** Estima o minuto-do-dia de chegada em cada parada (base → stops), a partir de startMinutes. */
export function estimateArrivals(start: GeoPoint, stops: RouteStop[], startMinutes: number): number[] {
  const arrivals: number[] = [];
  let cursor: GeoPoint = start;
  let clock = startMinutes;
  for (const s of stops) {
    clock += (haversineKm(cursor, s) / AVG_SPEED_KMH) * 60; // deslocamento
    arrivals.push(clock);
    clock += s.serviceMinutes ?? 30; // tempo de atendimento antes de sair pra próxima
    cursor = s;
  }
  return arrivals;
}

/** Detecta se alguma parada carrega dados de prioridade (urgência ou janela). */
function hasPriorityData(stops: RouteStop[]): boolean {
  return stops.some((s) => s.urgency != null || s.dueMinutes != null);
}

/**
 * Custo ponderado do caminho: km + penalidade de atraso na janela + penalidade de
 * adiar OS urgentes. Tudo em km-equivalente. Sem dados de prioridade, é só o km.
 */
export function scoredPathCost(start: GeoPoint, stops: RouteStop[], startMinutes: number): number {
  const km = pathDistanceKm(start, stops);
  if (!hasPriorityData(stops)) return km;
  const arrivals = estimateArrivals(start, stops, startMinutes);
  let penalty = 0;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i]!;
    const arr = arrivals[i]!;
    if (s.dueMinutes != null && arr > s.dueMinutes) {
      penalty += (arr - s.dueMinutes) * LATE_KM_PER_MIN; // chegou depois da janela
    }
    if (s.urgency) {
      penalty += (arr - startMinutes) * s.urgency * URGENCY_KM_PER_MIN; // urgente = mais cedo
    }
  }
  return km + penalty;
}

/** Distância total de um caminho aberto base → stops[0] → … → stops[n-1]. */
export function pathDistanceKm(start: GeoPoint, stops: GeoPoint[]): number {
  if (stops.length === 0) return 0;
  let total = haversineKm(start, stops[0]!);
  for (let i = 1; i < stops.length; i++) {
    total += haversineKm(stops[i - 1]!, stops[i]!);
  }
  return total;
}

/** Constrói uma rota gulosa: da posição atual, vai sempre à parada mais próxima. */
export function nearestNeighborOrder(start: GeoPoint, stops: RouteStop[]): RouteStop[] {
  const remaining = stops.slice();
  const order: RouteStop[] = [];
  let cursor: GeoPoint = start;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cursor, remaining[i]!);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]!;
    order.push(next);
    cursor = next;
  }

  return order;
}

/**
 * Melhora a rota com 2-opt: enquanto houver ganho, reverte segmentos que reduzem
 * a distância total. Caminho aberto a partir da base. Converge em poucas passadas
 * para o tamanho de rota de um dia de técnico.
 */
export function twoOptImprove(
  start: GeoPoint,
  initial: RouteStop[],
  cost: (start: GeoPoint, stops: RouteStop[]) => number = pathDistanceKm,
): RouteStop[] {
  if (initial.length < 3) return initial.slice();

  let best = initial.slice();
  let bestDist = cost(start, best);
  let improved = true;

  // Trava de segurança contra loop patológico (nunca deve ser atingida).
  let guard = 0;
  const maxIterations = 1000;

  while (improved && guard++ < maxIterations) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        // Reverte o segmento [i..j].
        const candidate = best.slice();
        const segment = candidate.slice(i, j + 1).reverse();
        candidate.splice(i, segment.length, ...segment);

        const candidateDist = cost(start, candidate);
        if (candidateDist + 1e-9 < bestDist) {
          best = candidate;
          bestDist = candidateDist;
          improved = true;
        }
      }
    }
  }

  return best;
}

/**
 * Otimiza a rota do dia: NN para a rota inicial → 2-opt para refinar.
 * Retorna a ordem final e o KM total estimado (base → todas as paradas).
 */
export function optimizeRoute(
  start: GeoPoint,
  stops: RouteStop[],
  opts: { startMinutes?: number } = {},
): OptimizedRoute {
  const weighted = hasPriorityData(stops);
  // Início do turno (default 08:00) para estimar horários de chegada.
  const startMinutes = opts.startMinutes ?? 8 * 60;
  const costFn = weighted
    ? (s: GeoPoint, st: RouteStop[]) => scoredPathCost(s, st, startMinutes)
    : pathDistanceKm;
  const algorithm: OptimizedRoute['algorithm'] = weighted ? 'weighted_2opt' : 'nearest_neighbor_2opt';

  if (stops.length <= 1) {
    return {
      order: stops.slice(),
      totalKm: Math.round(pathDistanceKm(start, stops) * 100) / 100,
      algorithm,
    };
  }

  const greedy = nearestNeighborOrder(start, stops);
  const refined = twoOptImprove(start, greedy, costFn);

  return {
    order: refined,
    // totalKm sempre reporta a distância real (a penalidade é só p/ ordenar).
    totalKm: Math.round(pathDistanceKm(start, refined) * 100) / 100,
    algorithm,
  };
}
