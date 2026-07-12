/**
 * ERP — interface comum e tipos normalizados. Plano Mestre V2, S75.
 * Port de src/lib/integrations/erpAdapter.ts (abstract ERPAdapter) para apps/api.
 */

export type ERPProviderName = 'ixc' | 'mkauth' | 'sgp' | 'voalle' | 'hubsoft' | 'radiusnet' | 'rbx';

/** Resultado normalizado de 2ª via — o que a IA envia ao cliente. */
export interface SecondCopyResult {
  boletoUrl: string;
  pixCopiaCola: string;
  barcode: string;
  dueDate: string;
  amountCents: number;
}

export interface ConnectionStatus {
  online: boolean;
  raw?: unknown;
}

/** HTTP injetável (fetch em prod, mock em teste). */
export type HttpClient = (url: string, init: any) => Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<any> }>;

export interface ERPProvider {
  readonly name: ERPProviderName;
  findCustomerByCpf(cpf: string): Promise<any>;
  getBillingStatus(cpfOrId: string): Promise<any>;
  generateSecondCopy(customerId: string, invoiceId: string): Promise<SecondCopyResult>;
  getConnectionStatus(cpfOrId: string): Promise<ConnectionStatus>;
  unlockCustomer(cpfOrId: string): Promise<any>;
}

export interface ERPCredentials {
  url: string;
  token: string;
  [k: string]: unknown;
}

// ── P3 — Vendas ──────────────────────────────────────────────────────────────

/** Resultado da verificação de viabilidade técnica por endereço. */
export interface ViabilityResult {
  available: boolean;
  ctoId?: string;
  ctoName?: string;
  availablePorts?: number;
  raw?: unknown;
}

/** Plano normalizado retornado pelo ERP. */
export interface ErpPlan {
  id: string;
  name: string;
  downloadMbps: number;
  uploadMbps: number;
  priceCents: number;
  description?: string;
}

/** Dados mínimos para pré-cadastro de lead no ERP. */
export interface LeadRegistration {
  fullName: string;
  cpf: string;
  email?: string;
  phone: string;
  address: string;
  planId: string;
}

/**
 * Capacidades de vendas que um ERP pode expor opcionalmente.
 * Verifique o suporte em runtime com `supportsErpSales(adapter)`.
 */
export interface ERPSalesCapable {
  checkViability(address: string): Promise<ViabilityResult>;
  getPlans(): Promise<ErpPlan[]>;
  createPreRegistration(data: LeadRegistration): Promise<{ leadId: string; externalId?: string }>;
  scheduleInstallation(leadId: string, scheduledDate: string): Promise<{ orderId: string }>;
}

/** Type guard — true se o adapter implementa ERPSalesCapable. */
export function supportsErpSales(p: ERPProvider): p is ERPProvider & ERPSalesCapable {
  return typeof (p as any).checkViability === 'function';
}

// ── P0-06 — Operações (suspensão / OS via ERP) ───────────────────────────────

/**
 * Capacidades operacionais que um ERP pode expor opcionalmente.
 * Verifique o suporte em runtime com `supportsErpOperations(adapter)`.
 */
export interface ERPOperationsCapable {
  /** Suspende o sinal/contrato do cliente no ERP (o oposto de unlockCustomer). */
  suspendCustomer(customerId: string, reason?: string): Promise<{ success: boolean; raw?: unknown }>;
  /** Abre uma OS de visita técnica no ERP (a OS mora no ERP quando há conector). */
  createServiceOrder(data: {
    customerId: string;
    description: string;
    scheduledFor?: string;
  }): Promise<{ orderId: string; raw?: unknown }>;
}

/** Type guard — true se o adapter implementa ERPOperationsCapable. */
export function supportsErpOperations(p: ERPProvider): p is ERPProvider & ERPOperationsCapable {
  return typeof (p as any).suspendCustomer === 'function'
    && typeof (p as any).createServiceOrder === 'function';
}

/**
 * Converte valor monetário de ERP (string ou número) para centavos.
 * Lida com formato brasileiro ("1.234,56" = ponto milhar + vírgula decimal) e
 * formato US ("1234.56"). Regra: se há vírgula, ela é o separador decimal e os
 * pontos são milhares; senão o ponto é decimal.
 */
export function parseAmountToCents(raw: unknown): number {
  if (typeof raw === 'number') return Math.round(raw * 100);
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  let normalized: string;
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.'); // BR: remove milhar, vírgula→ponto
  } else {
    normalized = s; // US ou inteiro
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
