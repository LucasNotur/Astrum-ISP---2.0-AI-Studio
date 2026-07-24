/**
 * Dossiê #37 — TopSapp Integração.
 * Adapter para o ERP TopSapp seguindo o mesmo padrão
 * dos demais adapters (IXC, MK-Auth, SGP, etc.).
 */

export interface TopSappConfig {
  baseUrl: string;
  apiKey: string;
  tenantId: string;
}

export interface TopSappCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  status: 'active' | 'suspended' | 'cancelled';
  plan?: string;
  address?: string;
}

export interface TopSappInvoice {
  id: string;
  customerId: string;
  amount: number;
  dueDate: string;
  status: 'open' | 'paid' | 'overdue' | 'cancelled';
  barcode?: string;
  pixCode?: string;
}

export interface TopSappServiceOrder {
  id: string;
  customerId: string;
  type: string;
  description: string;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  technicianId?: string;
  scheduledDate?: string;
}

export interface TopSappPorts {
  httpGet: <T>(url: string, headers: Record<string, string>) => Promise<T>;
  httpPost: <T>(url: string, body: unknown, headers: Record<string, string>) => Promise<T>;
}

function authHeaders(config: TopSappConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };
}

export async function listCustomers(
  config: TopSappConfig,
  ports: TopSappPorts,
): Promise<TopSappCustomer[]> {
  return ports.httpGet<TopSappCustomer[]>(
    `${config.baseUrl}/api/v1/customers`,
    authHeaders(config),
  );
}

export async function getCustomer(
  config: TopSappConfig,
  customerId: string,
  ports: TopSappPorts,
): Promise<TopSappCustomer | null> {
  try {
    return await ports.httpGet<TopSappCustomer>(
      `${config.baseUrl}/api/v1/customers/${customerId}`,
      authHeaders(config),
    );
  } catch {
    return null;
  }
}

export async function listInvoices(
  config: TopSappConfig,
  customerId: string,
  ports: TopSappPorts,
): Promise<TopSappInvoice[]> {
  return ports.httpGet<TopSappInvoice[]>(
    `${config.baseUrl}/api/v1/customers/${customerId}/invoices`,
    authHeaders(config),
  );
}

export async function createServiceOrder(
  config: TopSappConfig,
  order: Omit<TopSappServiceOrder, 'id' | 'status'>,
  ports: TopSappPorts,
): Promise<TopSappServiceOrder> {
  return ports.httpPost<TopSappServiceOrder>(
    `${config.baseUrl}/api/v1/service-orders`,
    { ...order, status: 'open' },
    authHeaders(config),
  );
}

export function normalizeStatus(topSappStatus: string): 'active' | 'suspended' | 'cancelled' | 'unknown' {
  const map: Record<string, 'active' | 'suspended' | 'cancelled'> = {
    ativo: 'active', active: 'active',
    suspenso: 'suspended', suspended: 'suspended', bloqueado: 'suspended',
    cancelado: 'cancelled', cancelled: 'cancelled', inativo: 'cancelled',
  };
  return map[topSappStatus.toLowerCase()] ?? 'unknown';
}
