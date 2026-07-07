/**
 * IA-33 — Population Stability Index (PSI).
 *
 * Mede o quanto uma distribuição `actual` se afastou de uma linha de base
 * `expected`. Referência: Siddiqi (2006) — escala padrão:
 *   PSI < 0.10  → sem drift (ok)
 *   0.10 ≤ PSI < 0.25 → drift moderado (medio)
 *   PSI ≥ 0.25  → drift significativo (alto)
 *
 * Implementação com suavização epsilon (1e-4) em ambas as caudas para
 * evitar divisão por zero quando uma categoria aparece em um lado mas
 * não no outro — caso comum em produção (nova intent ainda sem histórico).
 *
 * Puro, sem dependências — usado tanto no worker (cálculo por tenant) quanto
 * no painel (validação em runtime). Sem efeito colateral.
 */

export type PsiSeverity = 'ok' | 'medio' | 'alto';

const EPSILON = 1e-4;

export function psi(
  expected: Record<string, number>,
  actual: Record<string, number>,
): number {
  const cats = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const totalE = Object.values(expected).reduce((a, b) => a + b, 0) || 1;
  const totalA = Object.values(actual).reduce((a, b) => a + b, 0) || 1;

  let result = 0;
  for (const cat of cats) {
    const pE = ((expected[cat] ?? 0) + EPSILON) / (totalE + EPSILON * cats.size);
    const pA = ((actual[cat] ?? 0) + EPSILON) / (totalA + EPSILON * cats.size);
    result += (pA - pE) * Math.log(pA / pE);
  }
  return result;
}

export function psiSeverity(v: number): PsiSeverity {
  if (v < 0.1) return 'ok';
  if (v < 0.25) return 'medio';
  return 'alto';
}
