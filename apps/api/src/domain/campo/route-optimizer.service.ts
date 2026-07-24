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
}

export interface OptimizedRoute {
  order: RouteStop[];
  totalKm: number;
  /** Ordem original (índices) → nova posição, útil para debug/telemetria. */
  algorithm: 'nearest_neighbor_2opt';
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
export function twoOptImprove(start: GeoPoint, initial: RouteStop[]): RouteStop[] {
  if (initial.length < 3) return initial.slice();

  let best = initial.slice();
  let bestDist = pathDistanceKm(start, best);
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

        const candidateDist = pathDistanceKm(start, candidate);
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
export function optimizeRoute(start: GeoPoint, stops: RouteStop[]): OptimizedRoute {
  if (stops.length <= 1) {
    return {
      order: stops.slice(),
      totalKm: Math.round(pathDistanceKm(start, stops) * 100) / 100,
      algorithm: 'nearest_neighbor_2opt',
    };
  }

  const greedy = nearestNeighborOrder(start, stops);
  const refined = twoOptImprove(start, greedy);

  return {
    order: refined,
    totalKm: Math.round(pathDistanceKm(start, refined) * 100) / 100,
    algorithm: 'nearest_neighbor_2opt',
  };
}
