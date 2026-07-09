/**
 * IA-31 — Elo rating puro.
 * Fórmulas clássicas: expectedScore + updateElo.
 */

export function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

export function updateElo(
  ra: number,
  rb: number,
  result: 1 | 0 | 0.5,
  k = 32,
): [number, number] {
  const ea = expectedScore(ra, rb);
  const eb = 1 - ea;
  const sa = result;
  const sb = 1 - sa;
  return [
    Math.round(ra + k * (sa - ea)),
    Math.round(rb + k * (sb - eb)),
  ];
}
