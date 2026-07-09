import type { RiskBand } from './churn-score';

export const MONTHLY_CHURN_BY_BAND: Record<RiskBand, number> = {
  low: 0.005,
  medium: 0.02,
  high: 0.05,
  critical: 0.10,
};

export const LTV_MARGIN = 0.35;
const MAX_LIFETIME_MONTHS = 60;

export interface LtvInput {
  mrrCents: number;
  band: RiskBand;
}

export interface LtvResult {
  ltvCents: number;
  months: number;
}

export function computeLtv(input: LtvInput): LtvResult {
  if (input.mrrCents <= 0) return { ltvCents: 0, months: 0 };

  const churnRate = MONTHLY_CHURN_BY_BAND[input.band];
  const rawMonths = churnRate > 0 ? 1 / churnRate : MAX_LIFETIME_MONTHS;
  const months = Math.min(rawMonths, MAX_LIFETIME_MONTHS);
  const ltvCents = Math.round(input.mrrCents * LTV_MARGIN * months);

  return { ltvCents, months };
}
