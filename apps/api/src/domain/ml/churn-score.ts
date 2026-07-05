/**
 * IA-07 — Churn Score (heurístico, puro, auditável).
 *
 * Calcula um score de churn 0-100 baseado em pesos fixos interpretáveis.
 * A função é pura: recebe as features e retorna {score, riskBand}.
 *
 * Fase 1: baseline linear — pesos servem como feature importance inicial
 * para a fase 2 (XGBoost com labels reais de cancelamento).
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

export interface ChurnScoreResult {
  score: number;
  riskBand: RiskBand;
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
 */
export function computeChurnScore(features: ChurnFeatures): ChurnScoreResult {
  const score = clamp(
    CHURN_WEIGHTS.overdue * minRatio(features.overdueCount90d, 3) +
    CHURN_WEIGHTS.paymentDelay * minRatio(features.avgPaymentDelayDays180d, 15) +
    CHURN_WEIGHTS.tickets * minRatio(features.tickets90d, 5) +
    CHURN_WEIGHTS.negativeSentiment * features.negativeSentimentRatio90d +
    CHURN_WEIGHTS.downgrade * (features.downgrades180d > 0 ? 1 : 0) +
    CHURN_WEIGHTS.newCustomer * (features.tenureDays < 90 ? 1 : 0),
    0,
    100,
  );

  const band = RISK_BANDS.find(b => score < b.max)?.band ?? 'critical';

  return { score: Math.round(score * 100) / 100, riskBand: band };
}
