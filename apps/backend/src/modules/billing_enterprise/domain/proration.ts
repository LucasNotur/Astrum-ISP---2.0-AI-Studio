export interface ProrationResult {
  unusedCreditCents: number;
  newPlanCostForRemainingCents: number;
  amountDueCents: number;
  creditRolloverCents: number;
  description: string;
}

export class ProrationEngine {
  /**
   * Calcula matematicamente o crédito não utilizado e subtrai do custo do plano novo proporcionalmente.
   * Todos os valores entram e saem em centavos (Cents) para evitar perdas de precisão.
   */
  static calculate(
    oldPlanPriceCents: number,
    newPlanPriceCents: number,
    periodStartMs: number,
    periodEndMs: number,
    upgradeTimeMs: number
  ): ProrationResult {
    const totalDuration = periodEndMs - periodStartMs;
    if (totalDuration <= 0) {
      throw new Error('Duração do período de faturamento inválida.');
    }

    // Proporção do tempo restante no ciclo
    const unusedDuration = Math.max(0, periodEndMs - upgradeTimeMs);
    const unusedRatio = unusedDuration / totalDuration;

    // Calcula os créditos e novos débitos proporcionais (arredondamento matemático)
    const unusedCreditCents = Math.round(oldPlanPriceCents * unusedRatio);
    const newPlanCostForRemainingCents = Math.round(newPlanPriceCents * unusedRatio);

    const amountDueCents = newPlanCostForRemainingCents - unusedCreditCents;

    return {
      unusedCreditCents,
      newPlanCostForRemainingCents,
      amountDueCents: Math.max(0, amountDueCents), // Nunca negativo (o cliente não recebe dinheiro de volta, apenas rolling credit)
      creditRolloverCents: amountDueCents < 0 ? Math.abs(amountDueCents) : 0,
      description: `Upgrade de plano rateado. Crédito aplicado: ${(unusedCreditCents / 100).toFixed(2)} R$. Novo custo: ${(newPlanCostForRemainingCents / 100).toFixed(2)} R$.`
    };
  }
}
