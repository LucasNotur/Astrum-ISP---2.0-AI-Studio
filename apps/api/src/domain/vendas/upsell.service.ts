/**
 * SPEC 1 — Upsell/convert (migration 100: tabela `upsell_events`).
 *
 * Service PURO e testável: normaliza o input do operador e devolve o registro
 * a inserir. Todo I/O (Supabase) fica na rota `upsell.routes.ts`.
 */

export type UpsellOutcome = 'offered' | 'converted' | 'rejected';

export interface UpsellInput {
  customerId?: unknown;
  currentPlan?: unknown;
  suggestedPlan?: unknown;
  outcome?: unknown;
  /** Tenant enviado pelo body — SEMPRE ignorado (o tenant vem do JWT). */
  tenantId?: unknown;
}

export interface UpsellRecord {
  tenant_id: string;
  customer_id: string | null;
  current_plan: string | null;
  suggested_plan: string | null;
  outcome: UpsellOutcome;
  operator_id: string | null;
}

const VALID_OUTCOMES: readonly UpsellOutcome[] = ['offered', 'converted', 'rejected'];

export class UpsellValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpsellValidationError';
  }
}

function toNullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/**
 * Valida/normaliza o body de um evento de upsell.
 *
 * Regras:
 *  - `tenant_id` SEMPRE vem do JWT (`tenantId` argumento) — `body.tenantId` é ignorado.
 *  - `outcome` fora de ['offered','converted','rejected'] vira 'offered' (default).
 *  - Nada além do tenant é obrigatório: campos ausentes viram `null`.
 *  - Lança `UpsellValidationError` apenas quando o tenant está ausente/inválido.
 */
export function sanitizeUpsellInput(
  body: unknown,
  tenantId: string,
  operatorId?: string | null,
): UpsellRecord {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new UpsellValidationError('Tenant ausente ou inválido (obrigatório).');
  }

  const b = (body ?? {}) as UpsellInput;

  const rawOutcome = String(b.outcome ?? '');
  const outcome: UpsellOutcome = (VALID_OUTCOMES as readonly string[]).includes(rawOutcome)
    ? (rawOutcome as UpsellOutcome)
    : 'offered';

  return {
    tenant_id: tenantId,
    customer_id: toNullableString(b.customerId),
    current_plan: toNullableString(b.currentPlan),
    suggested_plan: toNullableString(b.suggestedPlan),
    outcome,
    operator_id: operatorId ? String(operatorId) : null,
  };
}
