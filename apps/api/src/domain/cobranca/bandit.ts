/**
 * IA-26 — Bandit Thompson Sampling (puro, sem I/O).
 *
 * Estratégia: cada variante vira um braço de um bandido multi-armado com prior Beta(1,1).
 * A cada pull, amostramos theta_v ~ Beta(alpha_v, beta_v) e escolhemos o braço com maior
 * theta. Conforme alpha/beta são atualizados pela função de recompensa, a distribuição
 * posterior se concentra nos braços com melhor taxa de conversão observada.
 *
 * RNG INJETÁVEL: obrigatório para teste determinístico. Nunca use Math.random
 * direto fora de testes — o worker injeta a seed.
 *
 * Referência: Marsaglia & Tsang (2000) — A Simple Method for Generating Gamma Variables.
 */

/** Amostra de Gamma(shape, 1) pelo método de Marsaglia–Tsang. shape >= 1 (nosso prior usa 1). */
export function sampleGamma(shape: number, rng: () => number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    const u1 = rng();
    const u2 = rng();
    const x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const v = Math.pow(1 + c * x, 3);
    if (v > 0 && Math.log(rng()) < 0.5 * x * x + d - d * v + d * Math.log(v)) {
      return d * v;
    }
  }
}

/** Amostra de Beta(alpha, beta) via razão de duas Gammas. */
export function sampleBeta(alpha: number, beta: number, rng: () => number): number {
  const a = sampleGamma(alpha, rng);
  const b = sampleGamma(beta, rng);
  return a / (a + b);
}

/**
 * Escolhe a variante com maior amostra de Beta(alpha, beta).
 * Retorna o `id` da variante vencedora. Com priors Beta(1,1) e nenhuma observação,
 * o comportamento é uniforme — a exploração é grátis.
 */
export function pickVariant(
  variants: { id: string; alpha: number; beta: number }[],
  rng: () => number = Math.random,
): string {
  return variants
    .map((v) => ({ id: v.id, score: sampleBeta(v.alpha, v.beta, rng) }))
    .sort((a, b) => b.score - a.score)[0]!.id;
}
