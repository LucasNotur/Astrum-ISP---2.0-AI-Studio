/**
 * CobrAI Guards — proteções portadas do cobraiWorker legado (S76).
 *
 * O worker novo (cobrai.worker.ts) tinha a régua por dias de atraso, mas faltavam
 * as guardas que impedem envio excessivo/inoportuno. Portadas aqui como funções puras.
 */

export interface CobraiWindow {
  /** hora de início (0–23) em que a régua pode enviar */
  start: number;
  /** hora de fim (0–23) */
  end: number;
}

/**
 * Verifica se o horário atual está dentro da janela permitida de cobrança.
 * Evita mandar cobrança de madrugada. `hour` é a hora local (0–23).
 */
export function isWithinCobraiWindow(hour: number, window?: CobraiWindow | null): boolean {
  if (!window) return true; // sem janela configurada = sempre permitido
  const { start, end } = window;
  if (start === end) return true;
  // Janela normal (ex.: 8–20) vs. janela que cruza meia-noite (ex.: 22–6)
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** True se ainda há orçamento de envios nesta hora (limite por hora do tenant). */
export function withinHourlyLimit(sentThisHour: number, limit: number): boolean {
  return sentThisHour < limit;
}

/** True se ainda há orçamento de envios hoje (limite diário). */
export function withinDailyLimit(sentToday: number, dailyLimit: number | null | undefined): boolean {
  if (dailyLimit == null) return true;
  return sentToday < dailyLimit;
}

/** True se o estágio da régua está ativo para o tenant (opt-out por estágio). */
export function isStageActive(
  stage: string,
  stagesConfig?: Record<string, { active?: boolean }> | null,
): boolean {
  if (!stagesConfig) return true;
  return stagesConfig[stage]?.active !== false;
}

export interface PaymentAgreement {
  active: boolean;
  nextDueDate?: Date | string | null;
}

/** True se o cliente tem acordo de parcelamento ativo e a próxima parcela ainda não venceu. */
export function hasActivePaymentAgreement(agreement?: PaymentAgreement | null): boolean {
  if (!agreement?.active) return false;
  if (!agreement.nextDueDate) return true;
  const nextDue = agreement.nextDueDate instanceof Date
    ? agreement.nextDueDate
    : new Date(agreement.nextDueDate);
  return nextDue > new Date();
}

/** True se houve pagamento recente (dentro da janela de compensação bancária). */
export function hasRecentPayment(recentPaymentCount: number): boolean {
  return recentPaymentCount > 0;
}

export interface CobraiSendGate {
  hour: number;
  window?: CobraiWindow | null;
  sentThisHour: number;
  hourlyLimit: number;
  sentToday: number;
  dailyLimit?: number | null;
  stage: string;
  stagesConfig?: Record<string, { active?: boolean }> | null;
  customerOptedOut?: boolean;
  paymentAgreement?: PaymentAgreement | null;
  recentPaymentCount?: number;
}

export interface GateDecision {
  allowed: boolean;
  reason: string;
}

/** Decisão única que combina todas as guardas. */
export function evaluateCobraiGate(g: CobraiSendGate): GateDecision {
  if (g.customerOptedOut) return { allowed: false, reason: 'customer_opted_out' };
  if (hasActivePaymentAgreement(g.paymentAgreement)) return { allowed: false, reason: 'active_payment_agreement' };
  if (!isStageActive(g.stage, g.stagesConfig)) return { allowed: false, reason: 'stage_inactive' };
  if (!isWithinCobraiWindow(g.hour, g.window)) return { allowed: false, reason: 'outside_window' };
  if (!withinHourlyLimit(g.sentThisHour, g.hourlyLimit)) return { allowed: false, reason: 'hourly_limit' };
  if (!withinDailyLimit(g.sentToday, g.dailyLimit)) return { allowed: false, reason: 'daily_limit' };
  if (g.stage === 'suspend_signal' && hasRecentPayment(g.recentPaymentCount ?? 0)) {
    return { allowed: false, reason: 'payment_pending_compensation' };
  }
  return { allowed: true, reason: 'ok' };
}
