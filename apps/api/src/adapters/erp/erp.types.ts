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
