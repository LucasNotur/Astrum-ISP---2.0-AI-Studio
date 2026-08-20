/**
 * Cobertura da rede — envoltória (convex hull) das CTOs do tenant + área em km².
 * Mostra no mapa a extensão de onde as caixas da empresa estão instaladas e a
 * "mancha" de expansão. Pura (sem I/O) → testável.
 */
export interface GeoPt { latitude: number; longitude: number }

/** Produto vetorial (orientação) de O→A × O→B. >0 = curva à esquerda. */
function cross(o: GeoPt, a: GeoPt, b: GeoPt): number {
  return (a.longitude - o.longitude) * (b.latitude - o.latitude)
       - (a.latitude - o.latitude) * (b.longitude - o.longitude);
}

/**
 * Convex hull (monotone chain de Andrew). Devolve os vértices em ordem anti-horária,
 * sem repetir o primeiro no fim. <3 pontos → devolve os próprios pontos únicos.
 */
export function convexHull(input: GeoPt[]): GeoPt[] {
  // Remove duplicados exatos.
  const seen = new Set<string>();
  const pts = input.filter((p) => {
    const k = `${p.latitude},${p.longitude}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (pts.length < 3) return pts;

  // Ordena por longitude, depois latitude.
  pts.sort((a, b) => (a.longitude - b.longitude) || (a.latitude - b.latitude));

  const lower: GeoPt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: GeoPt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

const EARTH_R = 6371; // km

/**
 * Área (km²) de um polígono geográfico via projeção equirretangular local
 * (metros ≈ graus × fator no centroide) + shoelace. Precisão ótima para as
 * escalas urbanas de uma rede de ISP (dezenas de km).
 */
export function polygonAreaKm2(poly: GeoPt[]): number {
  if (poly.length < 3) return 0;
  const latRad = (poly.reduce((s, p) => s + p.latitude, 0) / poly.length) * Math.PI / 180;
  const kmPerDegLat = (Math.PI * EARTH_R) / 180;
  const kmPerDegLng = kmPerDegLat * Math.cos(latRad);

  let area2 = 0; // 2× área no plano projetado
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ax = a.longitude * kmPerDegLng, ay = a.latitude * kmPerDegLat;
    const bx = b.longitude * kmPerDegLng, by = b.latitude * kmPerDegLat;
    area2 += ax * by - bx * ay;
  }
  return Math.abs(area2) / 2;
}

/** Hull + área de uma vez. */
export function coverageOf(points: GeoPt[]): { hull: GeoPt[]; areaKm2: number } {
  const hull = convexHull(points);
  return { hull, areaKm2: Math.round(polygonAreaKm2(hull) * 100) / 100 };
}
