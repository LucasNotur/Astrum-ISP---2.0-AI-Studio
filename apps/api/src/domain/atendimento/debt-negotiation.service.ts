/**
 * P1-03 — Negociação guiada.
 * Menu de opções parametrizado por tenant (desconto à vista + parcelamento).
 * Paridade com Mundiale. O negociador com alçada real fica no D-03 do PLANO_A.
 */
import supabase from '../../infrastructure/database/supabase.client';

export interface NegotiationPolicy {
  max_discount_pct: number;
  max_installments: number;
  enabled: boolean;
}

export interface NegotiationDb {
  from: (table: string) => any;
}

export const defaultNegotiationDb: NegotiationDb = supabase as any;

const DEFAULT_POLICY: NegotiationPolicy = {
  max_discount_pct: 10,
  max_installments: 3,
  enabled: true,
};

export interface NegotiationOption {
  type: 'instant' | 'installment';
  discount_pct?: number;
  installments?: number;
  total_cents: number;
  per_installment_cents?: number;
  description: string;
}

export interface NegotiationMenu {
  options: NegotiationOption[];
  debt_cents: number;
  expires_at: string;
  policy: NegotiationPolicy;
}

export async function buildNegotiationMenu(
  db: NegotiationDb,
  tenantId: string,
  debtCents: number,
): Promise<NegotiationMenu> {
  const { data: policyRow } = await db
    .from('negotiation_policies')
    .select('max_discount_pct, max_installments, enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const policy: NegotiationPolicy = policyRow ?? DEFAULT_POLICY;

  if (!policy.enabled || debtCents <= 0) {
    return { options: [], debt_cents: debtCents, expires_at: expiresAt(), policy };
  }

  const options: NegotiationOption[] = [];

  // Opção 1: pagamento à vista com desconto
  if (policy.max_discount_pct > 0) {
    const discountedCents = Math.round(debtCents * (1 - policy.max_discount_pct / 100));
    options.push({
      type: 'instant',
      discount_pct: policy.max_discount_pct,
      total_cents: discountedCents,
      description: `À vista com ${policy.max_discount_pct}% de desconto — ${formatBRL(discountedCents)}`,
    });
  }

  // Opções de parcelamento (de 2x até max_installments)
  for (let n = 2; n <= policy.max_installments; n++) {
    const perInstallment = Math.ceil(debtCents / n);
    options.push({
      type: 'installment',
      installments: n,
      total_cents: debtCents,
      per_installment_cents: perInstallment,
      description: `Em ${n}x de ${formatBRL(perInstallment)} sem juros`,
    });
  }

  return { options, debt_cents: debtCents, expires_at: expiresAt(), policy };
}

function expiresAt(): string {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  return d.toISOString();
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
