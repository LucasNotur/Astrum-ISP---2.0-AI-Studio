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
