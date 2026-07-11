/**
 * P1-01 — Religue por confiança.
 * Política por tenant (max vezes/ano, teto de dívida). Auditável.
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

export interface TrustUnlockPolicy {
  max_times_per_year: number;
  max_debt_cents: number;
  enabled: boolean;
}

export interface TrustUnlockDb {
  from: (table: string) => any;
}

export const defaultTrustUnlockDb: TrustUnlockDb = supabase as any;

const DEFAULT_POLICY: TrustUnlockPolicy = {
  max_times_per_year: 2,
  max_debt_cents: 20000, // R$200
  enabled: true,
};

export interface EligibilityResult {
  eligible: boolean;
  reason?: 'feature_disabled' | 'debt_exceeds_limit' | 'limit_reached';
  timesThisYear: number;
  policy: TrustUnlockPolicy;
}

export async function checkTrustUnlockEligibility(
  db: TrustUnlockDb,
  tenantId: string,
  customerId: string,
  debtCents: number,
): Promise<EligibilityResult> {
  const { data: policyRow } = await db
    .from('trust_unlock_policies')
    .select('max_times_per_year, max_debt_cents, enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const policy: TrustUnlockPolicy = policyRow ?? DEFAULT_POLICY;

  if (!policy.enabled) {
    return { eligible: false, reason: 'feature_disabled', timesThisYear: 0, policy };
  }

  if (debtCents > policy.max_debt_cents) {
    return { eligible: false, reason: 'debt_exceeds_limit', timesThisYear: 0, policy };
  }

  const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const { count } = await db
    .from('trust_unlocks')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .gte('created_at', startOfYear);

  const timesThisYear = count ?? 0;

  if (timesThisYear >= policy.max_times_per_year) {
    return { eligible: false, reason: 'limit_reached', timesThisYear, policy };
  }

  return { eligible: true, timesThisYear, policy };
}

export interface TrustUnlockResult {
  success: boolean;
  message: string;
  reason?: string;
}

export async function executeTrustUnlock(
  db: TrustUnlockDb,
  tenantId: string,
  customerId: string,
  debtCents: number,
): Promise<TrustUnlockResult> {
  const eligibility = await checkTrustUnlockEligibility(db, tenantId, customerId, debtCents);

  if (!eligibility.eligible) {
    return {
      success: false,
      message: reasonMessage(eligibility.reason!),
      reason: eligibility.reason,
    };
  }

  const { error: insertErr } = await db
    .from('trust_unlocks')
    .insert({ tenant_id: tenantId, customer_id: customerId, debt_cents_at_unlock: debtCents });

  if (insertErr) {
    infraLogger.error({ tenantId, customerId, error: insertErr }, 'trust_unlock: falha ao registrar');
    return { success: false, message: 'Erro interno ao registrar religue por confiança.' };
  }

  await db
    .from('customers')
    .update({ status: 'active' })
    .eq('tenant_id', tenantId)
    .eq('id', customerId);

  infraLogger.info({ tenantId, customerId, debtCents }, 'trust_unlock: cliente religado por confiança');

  const remainingThisYear =
    eligibility.policy.max_times_per_year - eligibility.timesThisYear - 1;

  return {
    success: true,
    message:
      `Serviço religado por confiança. Por favor, regularize sua situação em até 72 horas. ` +
      (remainingThisYear > 0
        ? `Você ainda tem ${remainingThisYear} religue(s) disponíveis este ano.`
        : 'Este foi o último religue por confiança deste ano.'),
  };
}

function reasonMessage(reason: EligibilityResult['reason']): string {
  switch (reason) {
    case 'feature_disabled':
      return 'O religue por confiança não está habilitado para este provedor.';
    case 'debt_exceeds_limit':
      return 'O valor da sua dívida excede o limite máximo para religue por confiança.';
    case 'limit_reached':
      return 'Você já utilizou todos os resgates de religue por confiança disponíveis este ano.';
    default:
      return 'Não foi possível realizar o religue por confiança no momento.';
  }
}
