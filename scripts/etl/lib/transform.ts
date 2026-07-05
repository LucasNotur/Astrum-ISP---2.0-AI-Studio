/**
 * ETL Transform — funções puras de mapeamento Firestore (legado) → Supabase (alvo).
 *
 * Plano Mestre V2, S69. Concentra AQUI toda a lógica de risco do backfill:
 * conversão de unidade monetária, mapeamento de enums divergentes e chaveamento
 * idempotente. São funções puras (sem I/O) exatamente para serem 100% testáveis —
 * um erro de centavos ou de enum aqui é risco financeiro/operacional.
 *
 * Referência campo-a-campo: docs/DB_MIGRATION_GAP_REPORT.md
 */

// ─── Dinheiro ────────────────────────────────────────────────────────────────

/**
 * Converte reais (number, como no Firestore) para centavos (INTEGER, como no alvo).
 * Usa arredondamento bancário simples via Math.round para evitar o erro clássico
 * de ponto flutuante (ex.: 19.99 * 100 = 1998.9999...). NUNCA truncar.
 */
export function reaisToCents(reais: number | null | undefined): number {
  if (reais == null || Number.isNaN(reais)) return 0;
  if (!Number.isFinite(reais)) throw new Error(`Valor monetário inválido: ${reais}`);
  return Math.round(reais * 100);
}

// ─── Enums ───────────────────────────────────────────────────────────────────

const CUSTOMER_STATUS_MAP: Record<string, 'active' | 'suspended' | 'cancelled'> = {
  active: 'active',
  inactive: 'suspended',
  pending: 'active',
  suspended: 'suspended',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

export function mapCustomerStatus(legacy: string | null | undefined): 'active' | 'suspended' | 'cancelled' {
  const key = (legacy ?? '').trim().toLowerCase();
  return CUSTOMER_STATUS_MAP[key] ?? 'active';
}

const TICKET_STATUS_MAP: Record<string, string> = {
  open: 'open',
  'in-progress': 'in_progress',
  in_progress: 'in_progress',
  resolved: 'resolved',
  closed: 'closed',
  escalated: 'escalated',
};

export function mapTicketStatus(legacy: string | null | undefined): string {
  const key = (legacy ?? '').trim().toLowerCase();
  return TICKET_STATUS_MAP[key] ?? 'open';
}

const TICKET_PRIORITY_MAP: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  urgent: 'critical',
  critical: 'critical',
};

export function mapTicketPriority(legacy: string | null | undefined): 'low' | 'medium' | 'high' | 'critical' {
  const key = (legacy ?? '').trim().toLowerCase();
  return TICKET_PRIORITY_MAP[key] ?? 'medium';
}

/** Mensagens: senderType legado (customer/ai/human) → role + from_ai do alvo. */
export function mapMessageRole(senderType: string | null | undefined): { role: 'user' | 'assistant' | 'system'; fromAi: boolean } {
  switch ((senderType ?? '').trim().toLowerCase()) {
    case 'customer': return { role: 'user', fromAi: false };
    case 'ai':       return { role: 'assistant', fromAi: true };
    case 'human':    return { role: 'assistant', fromAi: false };
    case 'system':   return { role: 'system', fromAi: false };
    default:         return { role: 'user', fromAi: false };
  }
}

// ─── Builders de linha (idempotentes por legacy_id) ──────────────────────────

export interface LegacyCustomer {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  cpf?: string;
  address?: string;
  mrr?: number;
  status?: string;
  retention_discount_used_at?: string;
  createdAt?: string;
}

/** Monta a linha de `customers` no alvo. `legacy_id` é a chave de idempotência do upsert. */
export function buildCustomerRow(tenantId: string, c: LegacyCustomer): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    legacy_id: c.id,
    name: c.name ?? 'Sem nome',
    email: c.email ?? null,
    phone: c.phone ?? null,
    cpf: c.cpf ?? null,
    address: c.address ?? null,
    mrr_cents: reaisToCents(c.mrr),
    status: mapCustomerStatus(c.status),
    retention_discount_used_at: c.retention_discount_used_at ?? null,
    created_at: c.createdAt ?? new Date().toISOString(),
  };
}

export interface LegacyInvoice {
  id: string;
  customerId: string;
  amount?: number;      // reais
  dueDate?: string;
  status?: string;
  paymentUrl?: string;
  pixCopyPaste?: string;
  createdAt?: string;
}

/**
 * Monta a linha de `invoices`. Preserva payment_url e pix_copy_paste (críticos — a IA
 * usa para enviar 2ª via). Requer o mapa legacy_customer_id → uuid já resolvido.
 */
export function buildInvoiceRow(
  tenantId: string,
  inv: LegacyInvoice,
  customerUuid: string | null,
): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    legacy_id: inv.id,
    customer_id: customerUuid,
    amount_cents: reaisToCents(inv.amount),
    due_date: inv.dueDate ?? null,
    status: (inv.status ?? 'pending').toLowerCase(),
    payment_url: inv.paymentUrl ?? null,
    pix_copy_paste: inv.pixCopyPaste ?? null,
    created_at: inv.createdAt ?? new Date().toISOString(),
  };
}

/**
 * ARMADILHA do gap report: o `audit_logs` legado (métricas de IA/SLA) NÃO pode ir
 * para `audit_log` (trilha de segurança). Vai para `ai_performance_logs`.
 * Esta função existe para deixar a decisão explícita e testável.
 */
export function auditLogTargetTable(): 'ai_performance_logs' {
  return 'ai_performance_logs';
}
