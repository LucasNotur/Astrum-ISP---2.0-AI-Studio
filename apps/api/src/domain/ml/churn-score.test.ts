import { describe, it, expect } from 'vitest';
import { computeChurnScore, CHURN_WEIGHTS } from './churn-score';
import type { ChurnFeatures } from './churn-score';

const base: ChurnFeatures = {
  tenureDays: 365,
  overdueCount90d: 0,
  avgPaymentDelayDays180d: 0,
  tickets30d: 0,
  tickets90d: 0,
  negativeSentimentRatio90d: 0,
  downgrades180d: 0,
  mrrCents: 9900,
};

describe('computeChurnScore', () => {
  it('cliente perfeito = score 0 e banda low', () => {
    const result = computeChurnScore(base);
    expect(result.score).toBe(0);
    expect(result.riskBand).toBe('low');
  });

  it('score máximo com todos os fatores no teto', () => {
    const result = computeChurnScore({
      ...base,
      overdueCount90d: 10,
      avgPaymentDelayDays180d: 30,
      tickets90d: 10,
      negativeSentimentRatio90d: 1,
      downgrades180d: 1,
      tenureDays: 30,
    });
    expect(result.score).toBe(100);
    expect(result.riskBand).toBe('critical');
  });

  it('cliente com 2 faturas atrasadas e atraso medio de 10 dias', () => {
    // overdue: 25 * (2/3) = 16.67
    // delay: 20 * (10/15) = 13.33
    // total: ~30
    const result = computeChurnScore({
      ...base,
      overdueCount90d: 2,
      avgPaymentDelayDays180d: 10,
    });
    expect(result.score).toBeCloseTo(30, 0);
    expect(result.riskBand).toBe('medium');
  });

  it('banda low: score < 25', () => {
    expect(computeChurnScore({ ...base, overdueCount90d: 2 }).riskBand).toBe('low');
  });

  it('banda medium: 25 <= score < 50', () => {
    // overdue: 25*(1) = 25, delay: 20*(0.5) = 10 -> 35
    expect(computeChurnScore({
      ...base, overdueCount90d: 3, avgPaymentDelayDays180d: 7.5,
    }).riskBand).toBe('medium');
  });

  it('banda high: 50 <= score < 75', () => {
    // overdue: 25*(1) = 25, tickets: 20*(1) = 20, negative: 15*0.5 = 7.5 -> 52.5
    expect(computeChurnScore({
      ...base, overdueCount90d: 5, tickets90d: 6, negativeSentimentRatio90d: 0.5,
    }).riskBand).toBe('high');
  });

  it('banda critical: score >= 75', () => {
    // overdue: 25, delay: 20, tickets: 20, negative: 15 -> 80
    expect(computeChurnScore({
      ...base,
      overdueCount90d: 5,
      avgPaymentDelayDays180d: 20,
      tickets90d: 10,
      negativeSentimentRatio90d: 1,
    }).riskBand).toBe('critical');
  });

  it('clamp inferior: score nunca fica negativo', () => {
    // sem dados, score deve ser >= 0
    const result = computeChurnScore({
      ...base, tenureDays: 0, overdueCount90d: 0,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('clamp superior: score nunca passa de 100', () => {
    const result = computeChurnScore({
      ...base,
      overdueCount90d: 999,
      avgPaymentDelayDays180d: 999,
      tickets90d: 999,
      negativeSentimentRatio90d: 999,
      downgrades180d: 999,
      tenureDays: 0,
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('downgrade contribui com 10 pontos', () => {
    const without = computeChurnScore(base);
    const withDowngrade = computeChurnScore({ ...base, downgrades180d: 1 });
    expect(withDowngrade.score - without.score).toBeCloseTo(CHURN_WEIGHTS.downgrade, 0);
  });

  it('novo cliente (tenure < 90) contribui com 10 pontos', () => {
    const old = computeChurnScore(base);
    const newcomer = computeChurnScore({ ...base, tenureDays: 30 });
    expect(newcomer.score - old.score).toBeCloseTo(CHURN_WEIGHTS.newCustomer, 0);
  });

  it('tenureDays = 90 nao conta como novo cliente', () => {
    const at90 = computeChurnScore({ ...base, tenureDays: 90 });
    const at89 = computeChurnScore({ ...base, tenureDays: 89 });
    expect(at89.score - at90.score).toBeCloseTo(CHURN_WEIGHTS.newCustomer, 0);
  });

  it('mrrCents nao afeta o score na fase 1 (observacional)', () => {
    const low = computeChurnScore({ ...base, mrrCents: 1000 });
    const high = computeChurnScore({ ...base, mrrCents: 100000 });
    expect(low.score).toBe(high.score);
  });

  it('negativeSentimentRatio90d proporcional', () => {
    const z = computeChurnScore({ ...base, negativeSentimentRatio90d: 0 });
    const half = computeChurnScore({ ...base, negativeSentimentRatio90d: 0.5 });
    const full = computeChurnScore({ ...base, negativeSentimentRatio90d: 1 });
    expect(half.score - z.score).toBeCloseTo(CHURN_WEIGHTS.negativeSentiment * 0.5, 0);
    expect(full.score - z.score).toBeCloseTo(CHURN_WEIGHTS.negativeSentiment, 0);
  });

  it('tickets90d cap = 5, além nao soma mais', () => {
    const at5 = computeChurnScore({ ...base, tickets90d: 5 });
    const at10 = computeChurnScore({ ...base, tickets90d: 10 });
    expect(at10.score).toBe(at5.score);
  });

  it('overdue cap = 3', () => {
    const at3 = computeChurnScore({ ...base, overdueCount90d: 3 });
    const at10 = computeChurnScore({ ...base, overdueCount90d: 10 });
    expect(at10.score).toBe(at3.score);
  });
});

/**
 * IA-38 — Vetor de contribuições e invariante soma(contribuição) == score.
 *
 * Como o modelo é linear, contribution === weight × value (sem clipping
 * por feature). O score final é o clamp(0..100) da soma. A tolerância de
 * 0.01 cobre o arredondamento a 2 casas que aplicamos no score retornado.
 */
describe('computeChurnScore — contributions (IA-38)', () => {
  it('shape: retorna 6 contribuições, uma por feature, na ordem do CHURN_WEIGHTS', () => {
    const result = computeChurnScore(base);
    expect(result.contributions).toHaveLength(6);
    const features = result.contributions.map(c => c.feature);
    expect(features).toEqual([
      'overdue',
      'paymentDelay',
      'tickets',
      'negativeSentiment',
      'downgrade',
      'newCustomer',
    ]);
    for (const c of result.contributions) {
      expect(c).toHaveProperty('weight');
      expect(c).toHaveProperty('value');
      expect(c).toHaveProperty('contribution');
      expect(c.contribution).toBeCloseTo(c.weight * c.value, 9);
    }
  });

  it('retrocompatibilidade: o shape antigo {score, riskBand} continua válido', () => {
    const result = computeChurnScore(base);
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('riskBand');
    expect(typeof result.score).toBe('number');
    expect(['low', 'medium', 'high', 'critical']).toContain(result.riskBand);
  });

  it('contribuição zero quando a feature é zero (cliente perfeito)', () => {
    const result = computeChurnScore(base);
    for (const c of result.contributions) {
      expect(c.value).toBe(0);
      expect(c.contribution).toBe(0);
    }
  });

  it('downgrade: contribution == 10 quando downgrades180d >= 1', () => {
    const r = computeChurnScore({ ...base, downgrades180d: 1 });
    const down = r.contributions.find(c => c.feature === 'downgrade')!;
    expect(down.value).toBe(1);
    expect(down.contribution).toBe(10);
  });

  it('newCustomer: contribution == 10 quando tenureDays < 90, 0 caso contrário', () => {
    const novo = computeChurnScore({ ...base, tenureDays: 30 });
    const novoContrib = novo.contributions.find(c => c.feature === 'newCustomer')!;
    expect(novoContrib.value).toBe(1);
    expect(novoContrib.contribution).toBe(10);

    const velho = computeChurnScore({ ...base, tenureDays: 365 });
    const velhoContrib = velho.contributions.find(c => c.feature === 'newCustomer')!;
    expect(velhoContrib.value).toBe(0);
    expect(velhoContrib.contribution).toBe(0);
  });

  it('INVARIANTE: |sum(contributions) - score| <= 0.01 com 20 fixtures variadas', () => {
    // 20 fixtures cobrindo o espectro: perfeitos, médios, no teto,
    // novos clientes, recém-downgrade, exatos, fracionários.
    const fixtures: ChurnFeatures[] = [
      base,
      { ...base, overdueCount90d: 1 },
      { ...base, overdueCount90d: 2, avgPaymentDelayDays180d: 5 },
      { ...base, overdueCount90d: 3, avgPaymentDelayDays180d: 15 },
      { ...base, overdueCount90d: 3, avgPaymentDelayDays180d: 15, tickets90d: 5 },
      { ...base, tickets90d: 2 },
      { ...base, tickets90d: 5, negativeSentimentRatio90d: 0.5 },
      { ...base, negativeSentimentRatio90d: 0.3 },
      { ...base, negativeSentimentRatio90d: 1 },
      { ...base, downgrades180d: 1 },
      { ...base, downgrades180d: 3 },
      { ...base, tenureDays: 1 },
      { ...base, tenureDays: 89 },
      { ...base, tenureDays: 90 }, // não é mais "novo"
      { ...base, tenureDays: 0 },
      { ...base, avgPaymentDelayDays180d: 7.5, tickets90d: 3, negativeSentimentRatio90d: 0.2 },
      { ...base, overdueCount90d: 1, avgPaymentDelayDays180d: 7.5, tickets90d: 2 },
      { ...base, downgrades180d: 1, tenureDays: 30 }, // dois bônus ao mesmo tempo
      // Teto: todos os fatores saturados. rawSum = 25+20+20+15+10+10 = 100, score=100.
      {
        ...base,
        overdueCount90d: 10,
        avgPaymentDelayDays180d: 30,
        tickets90d: 10,
        negativeSentimentRatio90d: 1,
        downgrades180d: 5,
        tenureDays: 0,
      },
      // Rounding stress: valores fracionários que exercitam o round(2) do score.
      // negativeSentimentRatio90d é uma RAZÃO ∈ [0,1] por contrato (production: extractFeatures).
      // rawSum = 25*0.5 + 20*(7.5/15) + 20*(3/5) + 15*0.33 + 0 + 0
      //        = 12.5 + 10 + 12 + 4.95 = 39.45 → score = 39.45
      {
        ...base,
        overdueCount90d: 1.5, // 1.5/3 = 0.5
        avgPaymentDelayDays180d: 7.5, // 0.5
        tickets90d: 3, // 3/5 = 0.6
        negativeSentimentRatio90d: 0.33,
      },
    ];

    for (const [i, fx] of fixtures.entries()) {
      const r = computeChurnScore(fx);
      const sum = r.contributions.reduce((acc, c) => acc + c.contribution, 0);
      // 0.01 cobre o arredondamento a 2 casas decimais do score retornado.
      // 1e-9 cobre erro de ponto flutuante da própria soma.
      expect(
        Math.abs(sum - r.score),
        `fixture #${i}: sum=${sum} vs score=${r.score}`,
      ).toBeLessThanOrEqual(0.01 + 1e-9);
    }
  });

  it('INVARIANTE estrito: |sum(contributions) - rawSum| <= 1e-9 (sem o arredondamento do score)', () => {
    // A soma das contribuições deve ser EXATAMENTE o rawSum pré-clamp.
    // O score final difere do rawSum por causa do clamp(0..100) + round(2).
    // Aqui validamos o passo intermediário, que é puramente aritmético.
    const fx: ChurnFeatures = {
      ...base,
      overdueCount90d: 7, // satura em 3
      avgPaymentDelayDays180d: 12, // 12/15
      tickets90d: 8, // satura em 5
      negativeSentimentRatio90d: 0.4,
      downgrades180d: 1,
      tenureDays: 45,
    };
    const r = computeChurnScore(fx);
    const expected =
      CHURN_WEIGHTS.overdue * 1 +
      CHURN_WEIGHTS.paymentDelay * (12 / 15) +
      CHURN_WEIGHTS.tickets * 1 +
      CHURN_WEIGHTS.negativeSentiment * 0.4 +
      CHURN_WEIGHTS.downgrade * 1 +
      CHURN_WEIGHTS.newCustomer * 1;
    const sum = r.contributions.reduce((acc, c) => acc + c.contribution, 0);
    expect(Math.abs(sum - expected)).toBeLessThanOrEqual(1e-9);
  });
});
