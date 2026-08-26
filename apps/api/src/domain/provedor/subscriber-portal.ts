/**
 * Subscriber Portal — lógica do portal white-label do assinante (PWA). Plano Mestre
 * V2, S94 (módulo novo; dossiê itens 11, 92). Puro e testável.
 *
 * O cliente final do ISP acessa por CPF + nº de contrato (não é login de operador).
 * Self-service: 2ª via, diagnóstico, acompanhar OS — sem falar com ninguém.
 */

export interface SubscriberAuthInput {
  cpf: string;
  contract: string;
}

export interface SubscriberRecord {
  customerId: string;
  cpf: string;          // já normalizado (só dígitos)
  contract: string;
  tenantId: string;
  active: boolean;
}

/** Normaliza CPF (só dígitos) para comparação. */
export function normalizeCpf(cpf: string): string {
  return (cpf ?? '').replace(/\D/g, '');
}

export type PortalAuthResult =
  | { ok: true; customerId: string; tenantId: string }
  | { ok: false; reason: 'not_found' | 'contract_mismatch' | 'inactive' | 'lookup_error' };

/**
 * Autentica o assinante por CPF+contrato contra o registro do ISP.
 * `opts.lookupError` sinaliza que a consulta ao banco falhou (infra) — nesse caso a
 * causa NÃO é CPF/contrato errados, e a rota deve responder diferente (500, não 401).
 */
export function authenticateSubscriber(
  input: SubscriberAuthInput,
  record: SubscriberRecord | null,
  opts: { lookupError?: boolean } = {},
): PortalAuthResult {
  if (opts.lookupError) return { ok: false, reason: 'lookup_error' };
  if (!record || normalizeCpf(input.cpf) !== record.cpf) return { ok: false, reason: 'not_found' };
  if (input.contract.trim() !== record.contract) return { ok: false, reason: 'contract_mismatch' };
  if (!record.active) return { ok: false, reason: 'inactive' };
  return { ok: true, customerId: record.customerId, tenantId: record.tenantId };
}

export type PortalAction = 'segunda_via' | 'diagnostico' | 'acompanhar_os' | 'historico';

/** Ações disponíveis no portal dado o status do cliente (suspenso limita algumas). */
export function availableActions(customerStatus: 'active' | 'suspended' | 'cancelled'): PortalAction[] {
  if (customerStatus === 'cancelled') return ['historico'];
  if (customerStatus === 'suspended') return ['segunda_via', 'historico']; // paga p/ religar
  return ['segunda_via', 'diagnostico', 'acompanhar_os', 'historico'];
}

// ── Acesso ao banco (P4-01) ───────────────────────────────────────────────────

export interface PortalDb {
  from: (table: string) => any;
}

import { supabaseAdmin as supabase } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
export const defaultPortalDb: PortalDb = supabase as any;

export interface SubscriberLookupResult {
  record: SubscriberRecord | null;
  /** true quando a consulta ao banco falhou (infra) — distinto de "CPF não encontrado". */
  lookupError: boolean;
}

/**
 * Busca o assinante pelo CPF normalizado no tenant.
 * "contract" = legacy_id do ERP (número que o assinante vê na fatura)
 * ou fallback para o UUID do cliente se legacy_id não existir.
 */
export async function lookupSubscriberByCpf(
  db: PortalDb,
  tenantId: string,
  cpf: string,
): Promise<SubscriberLookupResult> {
  const cpfNorm = normalizeCpf(cpf);
  const { data, error } = await db
    .from('customers')
    .select('id, cpf, legacy_id, status, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('cpf', cpfNorm)
    .maybeSingle();

  if (error) {
    infraLogger.error({ tenantId, err: error }, 'P4-01: falha ao consultar customers no portal do assinante — lookup por CPF indisponível');
    return { record: null, lookupError: true };
  }

  if (!data) return { record: null, lookupError: false };
  return {
    record: {
      customerId: data.id,
      cpf: normalizeCpf(data.cpf ?? ''),
      contract: data.legacy_id ?? data.id,   // ERP ID ou UUID como fallback
      tenantId: data.tenant_id,
      active: data.status === 'active',
    },
    lookupError: false,
  };
}

/** Busca as últimas faturas do assinante (max 10). */
export async function getCustomerInvoices(
  db: PortalDb,
  tenantId: string,
  customerId: string,
  limit = 10,
): Promise<any[]> {
  const { data, error } = await db
    .from('invoices')
    .select('id, amount_cents, due_date, status, paid_at, payment_url, pix_copy_paste')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('due_date', { ascending: false })
    .limit(limit);
  if (error) {
    infraLogger.error({ tenantId, customerId, err: error }, 'P4-01: falha ao consultar invoices no portal do assinante — lista pode estar vazia indevidamente');
  }
  return data ?? [];
}

/** Busca as OS abertas/recentes do assinante (max 5). */
export async function getCustomerServiceOrders(
  db: PortalDb,
  tenantId: string,
  customerId: string,
  limit = 5,
): Promise<any[]> {
  const { data, error } = await db
    .from('service_orders')
    .select('id, type, status, description, scheduled_for, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    infraLogger.error({ tenantId, customerId, err: error }, 'P4-01: falha ao consultar service_orders no portal do assinante — lista pode estar vazia indevidamente');
  }
  return data ?? [];
}
