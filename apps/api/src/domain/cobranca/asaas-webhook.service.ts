/**
 * FASE 2 — TAREFA 1: webhook de ENTRADA do Asaas (`POST /api/v2/webhook/asaas`).
 *
 * Escopo: cobranças do ISP (tenant) para os PRÓPRIOS clientes dele, sincronizadas
 * em `invoices` (ver asaas-sync.service.ts / gateway-sync.routes.ts — pull). Este
 * arquivo cobre o lado push (evento chega do Asaas em vez de ser puxado).
 *
 * Fora de escopo (decisão registrada em PLANO_FASE2_CONTINUACAO.md): o lockout de
 * TENANT por inadimplência do próprio ISP com a Astrum (`lockout_tenant`, legado em
 * `src/lib/billing.ts`). Verificado: `tenants.billing_status`/`asaas_customer_id`
 * não existem como colunas reais (nenhum tenant tem esse dado hoje) — essa frente
 * de cobrança nunca foi ativada em produção. Reintroduzir isso exige antes uma
 * migration + decisão do Lucas sobre como a Astrum cobra o ISP; não é desta tarefa.
 *
 * Lógica pura + porta injetável (`now`), sem I/O — testável sem Supabase/Redis.
 */

export type AsaasWebhookAction = 'mark_paid' | 'mark_overdue' | 'mark_cancelled' | 'ignore';

const PAID_EVENTS = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH']);
const OVERDUE_EVENTS = new Set(['PAYMENT_OVERDUE']);
const CANCELLED_EVENTS = new Set(['PAYMENT_DELETED']);

/** Mapeia o `event` do Asaas para a ação sobre a fatura local. Pura. */
export function resolveAsaasAction(event: string | null | undefined): AsaasWebhookAction {
  const e = event ?? '';
  if (PAID_EVENTS.has(e)) return 'mark_paid';
  if (OVERDUE_EVENTS.has(e)) return 'mark_overdue';
  if (CANCELLED_EVENTS.has(e)) return 'mark_cancelled';
  return 'ignore';
}

export interface InvoiceStatusPatch {
  status: 'paid' | 'overdue' | 'cancelled';
  paid_at?: string | null;
}

/** Monta o patch de status a aplicar em `invoices` para a ação decidida. Pura. */
export function buildInvoiceStatusPatch(action: AsaasWebhookAction, now: string): InvoiceStatusPatch | null {
  if (action === 'mark_paid') return { status: 'paid', paid_at: now };
  if (action === 'mark_overdue') return { status: 'overdue' };
  if (action === 'mark_cancelled') return { status: 'cancelled' };
  return null;
}

export interface InvoiceRow {
  id: string;
  tenant_id: string;
  customer_id: string;
}

export interface CobraiInvoicePaidJob {
  tenantId: string;
  customerId: string;
  invoiceId: string;
  amountCents?: number;
}

/** Monta o payload do job `invoice.paid` (fila cobrai) a partir da invoice resolvida. Pura. */
export function buildInvoicePaidJob(row: InvoiceRow, amountCents?: number | null): CobraiInvoicePaidJob {
  return {
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    invoiceId: row.id,
    amountCents: amountCents ?? undefined,
  };
}
