/**
 * PLANO I (Uber do Técnico) — Fase I-2 — Cálculo de KM rodado por GPS.
 *
 * Recebe os "breadcrumbs" (pings de GPS que o app acumula e envia em lote) de um
 * shift e calcula a distância percorrida via haversine entre pontos consecutivos,
 * descartando ruído: baixa precisão, saltos impossíveis e pontos parados.
 *
 * O odômetro manual do shift (start/end_odometer_km) fica como auditoria cruzada.
 * Lógica 100% pura — sem I/O, testável isoladamente. É um dos dois núcleos que o
 * DoD do PLANO_I exige cobrir com Vitest (o outro é a máquina de estados).
 */

export interface Breadcrumb {
  latitude: number;
  longitude: number;
  /** Precisão do fix em metros (accuracy do Geolocation API). Opcional. */
  accuracyM?: number;
  /** Timestamp ISO do ponto. Necessário para filtrar saltos por velocidade. */
  recordedAt: string;
}

export interface KmFilterOptions {
  /** Descarta pontos com accuracy pior que isto (metros). Default 50. */
  maxAccuracyM?: number;
  /** Descarta trechos cuja velocidade implícita excede isto (km/h). Default 150. */
  maxSpeedKmh?: number;
  /** Ignora deslocamentos menores que isto entre pontos (metros) — jitter parado. Default 10. */
  minSegmentM?: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distância em quilômetros entre dois pontos (fórmula de haversine). */
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Remove pontos de baixa precisão. Pontos sem accuracy informada são mantidos
 * (não há como julgá-los — o filtro de velocidade ainda os protege).
 */
export function filterByAccuracy(points: Breadcrumb[], maxAccuracyM: number): Breadcrumb[] {
  return points.filter((p) => p.accuracyM === undefined || p.accuracyM <= maxAccuracyM);
}

export interface KmResult {
  /** Distância total percorrida, em km, já filtrada. */
  km: number;
  /** Quantos pontos foram efetivamente usados após os filtros. */
  usedPoints: number;
  /** Quantos segmentos foram descartados por ruído (velocidade/jitter). */
  discardedSegments: number;
}

/**
 * Calcula o KM total de uma sequência de breadcrumbs. Ordena por tempo, aplica o
 * filtro de precisão e soma os segmentos válidos — descartando saltos impossíveis
 * (GPS pulando) e micro-movimentos de quem está parado.
 */
export function computeShiftKm(points: Breadcrumb[], options: KmFilterOptions = {}): KmResult {
  const maxAccuracyM = options.maxAccuracyM ?? 50;
  const maxSpeedKmh = options.maxSpeedKmh ?? 150;
  const minSegmentM = options.minSegmentM ?? 10;

  const clean = filterByAccuracy(points, maxAccuracyM)
    .slice()
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

  if (clean.length < 2) {
    return { km: 0, usedPoints: clean.length, discardedSegments: 0 };
  }

  let km = 0;
  let discarded = 0;

  for (let i = 1; i < clean.length; i++) {
    const prev = clean[i - 1];
    const curr = clean[i];
    const segKm = haversineKm(prev, curr);
    const segMeters = segKm * 1000;

    // Jitter de quem está parado: ignora sem contar como descarte de ruído grave.
    if (segMeters < minSegmentM) continue;

    const dtHours =
      (new Date(curr.recordedAt).getTime() - new Date(prev.recordedAt).getTime()) / 3_600_000;

    // Salto impossível: velocidade acima do teto (GPS glitch / troca de torre).
    if (dtHours > 0) {
      const speedKmh = segKm / dtHours;
      if (speedKmh > maxSpeedKmh) {
        discarded++;
        continue;
      }
    }

    km += segKm;
  }

  return {
    km: Math.round(km * 100) / 100,
    usedPoints: clean.length,
    discardedSegments: discarded,
  };
}

/**
 * Compara o KM calculado por GPS com o odômetro manual do técnico. Divergência
 * grande (default > 20%) vira sinal de auditoria para o gestor.
 */
export function auditKmDivergence(
  gpsKm: number,
  odometerKm: number,
  tolerancePct = 0.2,
): { divergent: boolean; deltaKm: number; deltaPct: number } {
  const deltaKm = Math.round(Math.abs(gpsKm - odometerKm) * 100) / 100;
  const base = odometerKm > 0 ? odometerKm : gpsKm;
  const deltaPct = base > 0 ? deltaKm / base : 0;
  return {
    divergent: deltaPct > tolerancePct,
    deltaKm,
    deltaPct: Math.round(deltaPct * 1000) / 1000,
  };
}
