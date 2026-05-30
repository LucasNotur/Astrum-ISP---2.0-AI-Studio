export type ConsumptionSuccessResult = {
  success: true;
  triggerWarning?: 'ALERT_75' | 'ALERT_90';
  mode?: 'OVERAGE';
};

export type ConsumptionErrorResult = {
  success: false;
  error: 'QUOTA_EXCEEDED';
  message: string;
};

export type ConsumptionResult = ConsumptionSuccessResult | ConsumptionErrorResult;

/**
 * Aplica as regras de negócio para soft-cap e hard-cap do sistema de assinaturas.
 *
 * @param currentUsage O uso atual do atributo antes do novo consumo
 * @param amount Quantidade a ser consumida nesta operação
 * @param limitValue Limite estipulado pelo plano (onde -1 representa ilimitado)
 * @param overagePricePerUnit Preço a ser cobrado caso ocorra overage 
 */
export function calculateQuotaConsumption(
  currentUsage: number,
  amount: number,
  limitValue: number,
  overagePricePerUnit: number
): ConsumptionResult {
  // Limites com valor -1 representam recursos ilimitados
  if (limitValue === -1) {
    return { success: true };
  }

  const newUsage = currentUsage + amount;
  const percentage = (newUsage / limitValue) * 100;

  // Hard-Cap absoluto: 120% (Bloqueia incondicionalmente para evitar instabilidade)
  if (percentage >= 120) {
    return {
      success: false,
      error: 'QUOTA_EXCEEDED',
      message: 'O sistema entrou em modo de contingência estático para evitar travamentos de faturamento.',
    };
  }

  // Atingiu 100% ou mais
  if (percentage >= 100) {
    // Se há permissão de cobrança excedente
    if (overagePricePerUnit > 0) {
      return { success: true, mode: 'OVERAGE' };
    } else {
      // Se não há permissão (sem valor de overage), barrar consumo
      return {
        success: false,
        error: 'QUOTA_EXCEEDED',
        message: 'O sistema entrou em modo de contingência estático para evitar travamentos de faturamento.',
      };
    }
  }

  // Soft-Cap: Atingiu ou ultrapassou 90%
  if (percentage >= 90) {
    return { success: true, triggerWarning: 'ALERT_90' };
  }

  // Soft-Cap: Atingiu ou ultrapassou 75%
  if (percentage >= 75) {
    return { success: true, triggerWarning: 'ALERT_75' };
  }

  return { success: true };
}
