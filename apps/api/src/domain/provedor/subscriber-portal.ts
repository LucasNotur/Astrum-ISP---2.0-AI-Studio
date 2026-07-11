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
  | { ok: false; reason: 'not_found' | 'contract_mismatch' | 'inactive' };

/** Autentica o assinante por CPF+contrato contra o registro do ISP. */
export function authenticateSubscriber(input: SubscriberAuthInput, record: SubscriberRecord | null): PortalAuthResult {
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

import supabase from '../../infrastructure/database/supabase.client';
export const defaultPortalDb: PortalDb = supabase as any;

/**
 * Busca o assinante pelo CPF normalizado no tenant.
 * "contract" = legacy_id do ERP (número que o assinante vê na fatura)
 * ou fallback para o UUID do cliente se legacy_id não existir.
 */
export async function lookupSubscriberByCpf(
  db: PortalDb,
  tenantId: string,
  cpf: string,
): Promise<SubscriberRecord | null> {
  const cpfNorm = normalizeCpf(cpf);
  const { data } = await db
    .from('customers')
    .select('id, cpf, legacy_id, status, tenant_id')
    .eq('tenant_id', tenantId)
    .eq('cpf', cpfNorm)
    .maybeSingle();

  if (!data) return null;
  return {
    customerId: data.id,
    cpf: normalizeCpf(data.cpf ?? ''),
    contract: data.legacy_id ?? data.id,   // ERP ID ou UUID como fallback
    tenantId: data.tenant_id,
    active: data.status === 'active',
  };
}

/** Busca as últimas faturas do assinante (max 10). */
export async function getCustomerInvoices(
  db: PortalDb,
  tenantId: string,
  customerId: string,
  limit = 10,
): Promise<any[]> {
  const { data } = await db
    .from('invoices')
    .select('id, amount_cents, due_date, status, paid_at, payment_url, pix_copy_paste')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('due_date', { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Busca as OS abertas/recentes do assinante (max 5). */
export async function getCustomerServiceOrders(
  db: PortalDb,
  tenantId: string,
  customerId: string,
  limit = 5,
): Promise<any[]> {
  const { data } = await db
    .from('service_orders')
    .select('id, type, status, description, scheduled_for, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}
