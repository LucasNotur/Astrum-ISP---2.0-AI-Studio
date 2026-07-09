/**
 * IA-07 — Churn Score (heurístico, puro, auditável).
 *
 * Calcula um score de churn 0-100 baseado em pesos fixos interpretáveis.
 * A função é pura: recebe as features e retorna {score, riskBand, contributions}.
 *
 * Fase 1: baseline linear — pesos servem como feature importance inicial
 * para a fase 2 (XGBoost com labels reais de cancelamento).
 *
 * IA-38: como o modelo é LINEAR, a contribuição de cada feature para o score
 * é exatamente `peso × valor_normalizado`. Isso NÃO é SHAP de verdade
 * (SHAP serve para modelos não-lineares / ensembles) — é o breakdown
 * "honesto" do próprio modelo. SHAP real só virá com a fase 2 (ADR da IA-24).
 *
 * Invariante (testado em churn-score.test.ts com 20 fixtures):
 *   sum(c.contribution) ≈ rawSum
 *   score === round2(clamp(rawSum, 0, 100))
 *   |sum(contributions) - score| ≤ 0.01  (tolerância do arredondamento a 2 casas)
 */

export interface ChurnFeatures {
  tenureDays: number;
  overdueCount90d: number;
  avgPaymentDelayDays180d: number;
  tickets30d: number;
  tickets90d: number;
  negativeSentimentRatio90d: number; // 0..1
  downgrades180d: number;
  mrrCents: number;
}

export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

/**
 * IA-38: contribuição de uma feature para o score.
 * Como o modelo é linear, contribution === weight × value (sem clipping,
 * sem baseline). O score final é o clamp(0..100) da soma.
 */
export interface ChurnContribution {
  feature: string;
  weight: number;
  value: number; // valor normalizado da feature (0..1)
  contribution: number; // weight × value
}

export interface ChurnScoreResult {
  score: number;
  riskBand: RiskBand;
  contributions: ChurnContribution[];
}

/**
 * Pesos heurísticos — auditáveis e comentados.
 * Cada peso reflete a contribuição máxima do fator para o score 0-100.
 */
export const CHURN_WEIGHTS = {
  overdue: 25,        // até 3 faturas em atraso nos últimos 90 dias
  paymentDelay: 20,   // atraso médio de 15+ dias nos últimos 180 dias
  tickets: 20,        // 5+ tickets nos últimos 90 dias
  negativeSentiment: 15, // proporção de sentimentos negativos nas interações
  downgrade: 10,      // fez downgrade nos últimos 180 dias
  newCustomer: 10,    // cliente com menos de 90 dias de casa
} as const;

export const RISK_BANDS: readonly { max: number; band: RiskBand }[] = [
  { max: 25, band: 'low' },
  { max: 50, band: 'medium' },
  { max: 75, band: 'high' },
  { max: Infinity, band: 'critical' },
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function minRatio(value: number, cap: number): number {
  return Math.min(value / cap, 1);
}

/**
 * Calcula o score de churn e a banda de risco associada.
 * Score = soma ponderada de fatores, limitada a 0-100.
 *
 * IA-38: retorna também `contributions[]` para a UI renderizar o
 * waterfall explicável. O vetor preserva o sinal de cada feature
 * (todas positivas neste modelo, já que todos os pesos são ≥ 0)
 * e o valor normalizado que foi multiplicado pelo peso.
 */
export function computeChurnScore(features: ChurnFeatures): ChurnScoreResult {
  // Mantém as features intermediárias como variáveis para o vetor de contribuições
  // ficar DRY em relação ao cálculo do score.
  const overdueValue = minRatio(features.overdueCount90d, 3);
  const paymentDelayValue = minRatio(features.avgPaymentDelayDays180d, 15);
  const ticketsValue = minRatio(features.tickets90d, 5);
  const negativeSentimentValue = features.negativeSentimentRatio90d;
  const downgradeValue = features.downgrades180d > 0 ? 1 : 0;
  const newCustomerValue = features.tenureDays < 90 ? 1 : 0;

  const contributions: ChurnContribution[] = [
    {
      feature: 'overdue',
      weight: CHURN_WEIGHTS.overdue,
      value: overdueValue,
      contribution: CHURN_WEIGHTS.overdue * overdueValue,
    },
    {
      feature: 'paymentDelay',
      weight: CHURN_WEIGHTS.paymentDelay,
      value: paymentDelayValue,
      contribution: CHURN_WEIGHTS.paymentDelay * paymentDelayValue,
    },
    {
      feature: 'tickets',
      weight: CHURN_WEIGHTS.tickets,
      value: ticketsValue,
      contribution: CHURN_WEIGHTS.tickets * ticketsValue,
    },
    {
      feature: 'negativeSentiment',
      weight: CHURN_WEIGHTS.negativeSentiment,
      value: negativeSentimentValue,
      contribution: CHURN_WEIGHTS.negativeSentiment * negativeSentimentValue,
    },
    {
      feature: 'downgrade',
      weight: CHURN_WEIGHTS.downgrade,
      value: downgradeValue,
      contribution: CHURN_WEIGHTS.downgrade * downgradeValue,
    },
    {
      feature: 'newCustomer',
      weight: CHURN_WEIGHTS.newCustomer,
      value: newCustomerValue,
      contribution: CHURN_WEIGHTS.newCustomer * newCustomerValue,
    },
  ];

  const rawSum = contributions.reduce((acc, c) => acc + c.contribution, 0);
  const score = clamp(rawSum, 0, 100);

  const band = RISK_BANDS.find(b => score < b.max)?.band ?? 'critical';

  return { score: Math.round(score * 100) / 100, riskBand: band, contributions };
}
