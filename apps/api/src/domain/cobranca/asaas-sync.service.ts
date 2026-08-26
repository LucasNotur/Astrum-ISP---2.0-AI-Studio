/**
 * PLANO F — F6-02 (wiring) — Sincroniza cobranças do Asaas para `invoices`.
 *
 * O adapter (adapters/gateway/asaas.adapter.ts) já busca e normaliza as cobranças;
 * faltava o elo que mapeia AsaasCharge → linha de `invoices` e faz upsert (dedupe
 * por external_id). É o que satisfaz o "faturas aparecem no CobrAI" do PLANO_F.
 *
 * Lógica pura + ports injetáveis (sem Supabase/HTTP nos testes), no padrão do repo.
 */
import type { AsaasCharge } from '../../adapters/gateway/asaas.adapter';

export interface InvoiceUpsertRow {
  tenant_id: string;
  customer_id: string;
  external_id: string;
  amount_cents: number;
  status: string;          // 'paid' | 'overdue' | 'pending'
  due_date: string;        // YYYY-MM-DD
  paid_at: string | null;
  payment_url: string | null;
  pix_copy_paste: string | null;
  extra: Record<string, unknown>;
}

/** Mapeia uma cobrança Asaas para a linha de `invoices`. Pura. */
export function mapChargeToInvoiceRow(tenantId: string, customerId: string, charge: AsaasCharge): InvoiceUpsertRow {
  return {
    tenant_id: tenantId,
    customer_id: customerId,
    external_id: charge.externalId,
    amount_cents: charge.amountCents,
    status: charge.status,
    due_date: charge.dueDate,
    paid_at: charge.paidAt,
    payment_url: charge.invoiceUrl,
    pix_copy_paste: charge.pixCopyPaste,
    extra: { source: 'asaas', customer_external_id: charge.customerExternalId },
  };
}

export interface AsaasSyncPorts {
  /** Busca as cobranças do gateway (o real usa AsaasAdapter). */
  listCharges: (tenantId: string) => Promise<AsaasCharge[]>;
  /** Resolve o customer_id local a partir do id externo do Asaas. Null = pular. */
  resolveCustomerId: (tenantId: string, customerExternalId: string) => Promise<string | null>;
  /** Insere ou atualiza a fatura (dedupe por tenant+external_id). */
  upsertInvoice: (row: InvoiceUpsertRow) => Promise<'inserted' | 'updated'>;
}

export interface AsaasSyncResult {
  fetched: number;
  synced: number;
  overdue: number;
  skippedNoCustomer: number;
  skippedInvalid: number;
  inserted: number;
  updated: number;
  /** Presente (e não-vazio) quando alguma cobrança/consulta falhou — sync parcial. */
  errors?: string[];
}

/**
 * Puxa as cobranças e faz upsert em `invoices`. Pula cobranças sem cliente local
 * resolvido (cliente precisa existir — importado via ERP/planilha antes) e sem
 * vencimento (coluna NOT NULL).
 *
 * Nunca lança por causa de uma cobrança ruim OU de uma falha de infra pontual — a rota
 * responde sempre 200 com contadores (contrato existente). Falhas (ex.: erro do
 * Supabase nos ports) são acumuladas em `errors` para o resultado deixar de "mentir"
 * sucesso total quando na real algo falhou.
 */
export async function syncAsaasInvoices(tenantId: string, ports: AsaasSyncPorts): Promise<AsaasSyncResult> {
  const result: AsaasSyncResult = {
    fetched: 0, synced: 0, overdue: 0,
    skippedNoCustomer: 0, skippedInvalid: 0, inserted: 0, updated: 0,
  };
  const errors: string[] = [];

  let charges: AsaasCharge[];
  try {
    charges = await ports.listCharges(tenantId);
  } catch (err: any) {
    errors.push(`listCharges: ${err?.message ?? String(err)}`);
    result.errors = errors;
    return result;
  }
  result.fetched = charges.length;

  for (const charge of charges) {
    if (!charge.externalId || !charge.dueDate) { result.skippedInvalid++; continue; }

    let customerId: string | null;
    try {
      customerId = await ports.resolveCustomerId(tenantId, charge.customerExternalId);
    } catch (err: any) {
      errors.push(`resolveCustomerId(${charge.externalId}): ${err?.message ?? String(err)}`);
      continue;
    }
    if (!customerId) { result.skippedNoCustomer++; continue; }

    const row = mapChargeToInvoiceRow(tenantId, customerId, charge);
    try {
      const op = await ports.upsertInvoice(row);
      result.synced++;
      if (op === 'inserted') result.inserted++; else result.updated++;
      if (charge.status === 'overdue') result.overdue++;
    } catch (err: any) {
      errors.push(`upsertInvoice(${charge.externalId}): ${err?.message ?? String(err)}`);
    }
  }

  if (errors.length > 0) result.errors = errors;
  return result;
}
