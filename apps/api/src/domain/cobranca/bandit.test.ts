import { describe, it, expect } from 'vitest';
import { sampleGamma, sampleBeta, pickVariant } from './bandit';

/**
 * Mulberry32 — PRNG seedável de 32 bits. Suficiente para teste determinístico
 * do bandido; não é uso criptográfico.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('bandit (Thompson sampling)', () => {
  describe('sampleGamma', () => {
    it('retorna número positivo para shape=1 (prior Beta(1,1))', () => {
      const rng = mulberry32(1);
      const g = sampleGamma(1, rng);
      expect(g).toBeGreaterThan(0);
      expect(Number.isFinite(g)).toBe(true);
    });

    it('é determinístico com o mesmo seed', () => {
      const a = sampleGamma(2, mulberry32(42));
      const b = sampleGamma(2, mulberry32(42));
      expect(a).toBe(b);
    });

    it('muda com seed diferente', () => {
      const a = sampleGamma(2, mulberry32(1));
      const b = sampleGamma(2, mulberry32(2));
      expect(a).not.toBe(b);
    });
  });

  describe('sampleBeta', () => {
    it('retorna valor em [0, 1] para alpha=beta=1', () => {
      const rng = mulberry32(7);
      for (let i = 0; i < 20; i++) {
        const x = sampleBeta(1, 1, rng);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      }
    });

    it('amostra fica perto da média (alpha/(alpha+beta))', () => {
      const rng = mulberry32(123);
      let sum = 0;
      const n = 500;
      for (let i = 0; i < n; i++) sum += sampleBeta(3, 1, rng);
      const mean = sum / n;
      // média teórica = 3/4 = 0.75; tolerância ampla para sample size moderado
      expect(mean).toBeGreaterThan(0.55);
      expect(mean).toBeLessThan(0.95);
    });

    it('é determinístico com mesmo seed', () => {
      const a = sampleBeta(3, 1, mulberry32(99));
      const b = sampleBeta(3, 1, mulberry32(99));
      expect(a).toBe(b);
    });
  });

  describe('pickVariant', () => {
    it('retorna o id de uma das variantes fornecidas', () => {
      const variants = [
        { id: 'a', alpha: 1, beta: 1 },
        { id: 'b', alpha: 1, beta: 1 },
        { id: 'c', alpha: 1, beta: 1 },
      ];
      expect(variants.map((v) => v.id)).toContain(pickVariant(variants, mulberry32(1)));
    });

    it('é determinístico com o mesmo RNG', () => {
      const variants = [
        { id: 'a', alpha: 1, beta: 1 },
        { id: 'b', alpha: 1, beta: 1 },
      ];
      expect(pickVariant(variants, mulberry32(2026))).toBe(
        pickVariant(variants, mulberry32(2026)),
      );
    });

    it('com priors uniformes (alpha=beta=1), distribui entre as variantes (sem viés)', () => {
      const variants = [
        { id: 'a', alpha: 1, beta: 1 },
        { id: 'b', alpha: 1, beta: 1 },
        { id: 'c', alpha: 1, beta: 1 },
      ];
      const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
      for (let i = 0; i < 600; i++) {
        const id = pickVariant(variants, mulberry32(i));
        counts[id] = (counts[id] ?? 0) + 1;
      }
      // Cada braço entre 25% ± 10pp — exploração livre com prior Beta(1,1).
      for (const id of ['a', 'b', 'c']) {
        const rate = counts[id]! / 600;
        expect(rate).toBeGreaterThan(0.15);
        expect(rate).toBeLessThan(0.45);
      }
    });

    it('converge para a variante dominante (alpha>>beta) ao longo de muitas amostras', () => {
      // "winner" com 99 sucessos / 1 falha; "loser" com 1 sucesso / 99 falhas.
      const variants = [
        { id: 'winner', alpha: 100, beta: 2 },
        { id: 'loser', alpha: 2, beta: 100 },
      ];
      let wins = 0;
      const trials = 200;
      for (let i = 0; i < trials; i++) {
        if (pickVariant(variants, mulberry32(i * 7 + 1)) === 'winner') wins += 1;
      }
      // Com posteriors tão desbalanceados, a chance de escolher "loser" é minúscula.
      expect(wins / trials).toBeGreaterThan(0.9);
    });

    it('se a entrada está vazia, .sort()[0] é undefined — caller não deve chamar com []', () => {
      // Não é cenário esperado (variant-picker.service já filtra length<2),
      // mas deixamos o tipo estrito: o índice 0 existe quando há ao menos 1.
      // Aqui só validamos que `pickVariant` exige ao menos 1 entrada para
      // acessar [0] com segurança.
      const variants = [{ id: 'only', alpha: 1, beta: 1 }];
      expect(pickVariant(variants, mulberry32(0))).toBe('only');
    });
  });
});
