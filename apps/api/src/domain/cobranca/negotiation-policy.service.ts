/**
 * D-03 — NEGOCIADOR AUTÔNOMO: policy engine de alçada financeira.
 *
 * Define os limites dentro dos quais o agente pode negociar SOZINHO:
 * - maxInstallments: parcelamento máximo (ex.: 3×)
 * - maxDiscountPct: desconto máximo sobre o saldo (ex.: 10%)
 * - fineWaiverPerYear: isenções de multa por ano (ex.: 1)
 * - autoApproveUpToCents: valor até o qual aprovação automática (ex.: R$ 500)
 *
 * Validador é função pura (testável) — recebe a proposta do agente e a policy
 * do tenant, devolve allowed/denied com justificativa.
 *
 * Persistência via Supabase (tabela negotiation_policies + negotiation_agreements).
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

// ── Types ───────────────────────────────────────────────────────────────────

export interface NegotiationPolicy {
  tenantId: string;
  maxInstallments: number;
  maxDiscountPct: number;
  fineWaiverPerYear: number;
  autoApproveUpToCents: number;
}

export interface NegotiationProposal {
  customerId: string;
  debtCents: number;
  installments: number;
  discountPct: number;
  waiveFine: boolean;
}

export interface NegotiationVerdict {
  allowed: boolean;
  reasons: string[];
}

export interface NegotiationAgreement {
  id?: string;
  tenantId: string;
  customerId: string;
  originalDebtCents: number;
  agreedAmountCents: number;
  installments: number;
  discountPct: number;
  fineWaived: boolean;
  status: 'active' | 'fulfilled' | 'defaulted' | 'cancelled';
  createdAt?: string;
}

export const DEFAULT_POLICY: Omit<NegotiationPolicy, 'tenantId'> = {
  maxInstallments: 3,
  maxDiscountPct: 10,
  fineWaiverPerYear: 1,
  autoApproveUpToCents: 50000,
};

// ── Validator (puro, testável) ──────────────────────────────────────────────

export function validateProposal(
  proposal: NegotiationProposal,
  policy: NegotiationPolicy,
  fineWaiversUsedThisYear: number,
): NegotiationVerdict {
  const reasons: string[] = [];

  if (proposal.installments > policy.maxInstallments) {
    reasons.push(`Parcelamento ${proposal.installments}× excede máximo ${policy.maxInstallments}×`);
  }

  if (proposal.discountPct > policy.maxDiscountPct) {
    reasons.push(`Desconto ${proposal.discountPct}% excede máximo ${policy.maxDiscountPct}%`);
  }

  if (proposal.waiveFine && fineWaiversUsedThisYear >= policy.fineWaiverPerYear) {
    reasons.push(`Isenção de multa esgotada (${fineWaiversUsedThisYear}/${policy.fineWaiverPerYear} usadas este ano)`);
  }

  if (proposal.debtCents > policy.autoApproveUpToCents) {
    reasons.push(`Valor R$ ${(proposal.debtCents / 100).toFixed(2)} excede alçada automática R$ ${(policy.autoApproveUpToCents / 100).toFixed(2)} — requer aprovação humana`);
  }

  return { allowed: reasons.length === 0, reasons };
}

// ── Persistence ─────────────────────────────────────────────────────────────

export async function getPolicy(
  tenantId: string,
  db: typeof supabase = supabase,
): Promise<NegotiationPolicy> {
  const { data } = await db
    .from('negotiation_policies')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (data) {
    return {
      tenantId,
      maxInstallments: data.max_installments ?? DEFAULT_POLICY.maxInstallments,
      maxDiscountPct: data.max_discount_pct ?? DEFAULT_POLICY.maxDiscountPct,
      fineWaiverPerYear: data.fine_waiver_per_year ?? DEFAULT_POLICY.fineWaiverPerYear,
      autoApproveUpToCents: data.auto_approve_up_to_cents ?? DEFAULT_POLICY.autoApproveUpToCents,
    };
  }

  return { tenantId, ...DEFAULT_POLICY };
}

export async function upsertPolicy(
  policy: NegotiationPolicy,
  db: typeof supabase = supabase,
): Promise<void> {
  const { error } = await db
    .from('negotiation_policies')
    .upsert({
      tenant_id: policy.tenantId,
      max_installments: policy.maxInstallments,
      max_discount_pct: policy.maxDiscountPct,
      fine_waiver_per_year: policy.fineWaiverPerYear,
      auto_approve_up_to_cents: policy.autoApproveUpToCents,
    }, { onConflict: 'tenant_id' });

  if (error) throw new Error(`D-03: falha ao salvar policy: ${error.message}`);
  infraLogger.info({ tenantId: policy.tenantId }, 'D-03: policy de negociação atualizada');
}

export async function countFineWaiversThisYear(
  tenantId: string,
  customerId: string,
  db: typeof supabase = supabase,
): Promise<number> {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const { count } = await db
    .from('negotiation_agreements')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .eq('fine_waived', true)
    .gte('created_at', yearStart);
  return count ?? 0;
}

export async function createAgreement(
  agreement: NegotiationAgreement,
  db: typeof supabase = supabase,
): Promise<string> {
  const { data, error } = await db
    .from('negotiation_agreements')
    .insert({
      tenant_id: agreement.tenantId,
      customer_id: agreement.customerId,
      original_debt_cents: agreement.originalDebtCents,
      agreed_amount_cents: agreement.agreedAmountCents,
      installments: agreement.installments,
      discount_pct: agreement.discountPct,
      fine_waived: agreement.fineWaived,
      status: agreement.status,
    })
    .select('id')
    .single();

  if (error) throw new Error(`D-03: falha ao criar acordo: ${error.message}`);
  infraLogger.info({ tenantId: agreement.tenantId, customerId: agreement.customerId }, 'D-03: acordo de negociação criado');
  return data.id;
}

export async function listAgreements(
  tenantId: string,
  opts: { status?: string; limit?: number } = {},
  db: typeof supabase = supabase,
): Promise<NegotiationAgreement[]> {
  let query = db
    .from('negotiation_agreements')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.status) query = query.eq('status', opts.status);

  const { data, error } = await query;
  if (error) throw new Error(`D-03: falha ao listar acordos: ${error.message}`);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    originalDebtCents: row.original_debt_cents,
    agreedAmountCents: row.agreed_amount_cents,
    installments: row.installments,
    discountPct: row.discount_pct,
    fineWaived: row.fine_waived,
    status: row.status,
    createdAt: row.created_at,
  }));
}
