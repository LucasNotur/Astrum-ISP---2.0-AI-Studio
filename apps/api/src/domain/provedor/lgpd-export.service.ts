/**
 * LGPD Art. 18/19 — direito à PORTABILIDADE / acesso: exporta TODOS os dados pessoais
 * de um titular (por e-mail), num pacote estruturado que o provedor entrega ao cliente.
 *
 * Complementa o expurgo (`lgpd-expunge.service.ts`, direito ao apagamento). Cobre o mesmo
 * footprint de PII que o expurgo anonimiza + os dados que o titular tem direito de receber
 * (faturas, ordens de serviço, tickets, mensagens).
 *
 * Lógica pura com DB injetado (`LgpdExportDb`) — testável sem Supabase. Escopo de tenant é
 * SEMPRE aplicado (o tenant vem do JWT na rota, nunca do body) para não vazar cross-tenant.
 */
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

export interface LgpdExportDb {
  findCustomerIdsByEmail(tenantId: string, email: string): Promise<string[]>;
  getCustomers(tenantId: string, ids: string[]): Promise<any[]>;
  getInvoices(tenantId: string, ids: string[]): Promise<any[]>;
  getServiceOrders(tenantId: string, ids: string[]): Promise<any[]>;
  getTickets(tenantId: string, ids: string[]): Promise<any[]>;
  getMessages(tenantId: string, ids: string[]): Promise<any[]>;
}

export interface LgpdExport {
  found: boolean;
  email: string;
  exportedAt: string;
  customerIds: string[];
  counts: Record<string, number>;
  data: {
    customers: any[];
    invoices: any[];
    serviceOrders: any[];
    tickets: any[];
    messages: any[];
  };
}

export async function exportCustomerByEmail(
  db: LgpdExportDb,
  tenantId: string,
  email: string,
): Promise<LgpdExport> {
  const trimmed = (email ?? '').trim();
  const base: LgpdExport = {
    found: false,
    email: trimmed,
    exportedAt: new Date().toISOString(),
    customerIds: [],
    counts: { customers: 0, invoices: 0, serviceOrders: 0, tickets: 0, messages: 0 },
    data: { customers: [], invoices: [], serviceOrders: [], tickets: [], messages: [] },
  };
  if (!trimmed) return base;

  const ids = await db.findCustomerIdsByEmail(tenantId, trimmed);
  if (ids.length === 0) return base;

  const [customers, invoices, serviceOrders, tickets, messages] = await Promise.all([
    db.getCustomers(tenantId, ids),
    db.getInvoices(tenantId, ids),
    db.getServiceOrders(tenantId, ids),
    db.getTickets(tenantId, ids),
    db.getMessages(tenantId, ids),
  ]);

  return {
    found: true,
    email: trimmed,
    exportedAt: base.exportedAt,
    customerIds: ids,
    counts: {
      customers: customers.length,
      invoices: invoices.length,
      serviceOrders: serviceOrders.length,
      tickets: tickets.length,
      messages: messages.length,
    },
    data: { customers, invoices, serviceOrders, tickets, messages },
  };
}

// ── Implementação Supabase (service_role, sempre filtrando por tenant_id) ──────

const sb = supabaseAdmin as any;

async function sel(table: string, tenantId: string, col: string, ids: string[]): Promise<any[]> {
  if (ids.length === 0) return [];
  const { data, error } = await sb.from(table).select('*').eq('tenant_id', tenantId).in(col, ids);
  if (error) {
    infraLogger.error({ err: error, table, tenantId }, 'LGPD export: falha ao consultar dados do titular');
    return [];
  }
  return data ?? [];
}

export const defaultLgpdExportDb: LgpdExportDb = {
  async findCustomerIdsByEmail(tenantId, email) {
    const { data, error } = await sb
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('email', email);
    if (error) {
      infraLogger.error({ err: error, tenantId }, 'LGPD export: falha ao localizar titular por e-mail');
      return [];
    }
    return (data ?? []).map((r: any) => r.id);
  },
  getCustomers: (tenantId, ids) => sel('customers', tenantId, 'id', ids),
  getInvoices: (tenantId, ids) => sel('invoices', tenantId, 'customer_id', ids),
  getServiceOrders: (tenantId, ids) => sel('service_orders', tenantId, 'customer_id', ids),
  getTickets: (tenantId, ids) => sel('tickets', tenantId, 'customer_id', ids),
  async getMessages(tenantId, ids) {
    if (ids.length === 0) return [];
    // mensagens vivem em conversations do titular → resolve conversas primeiro
    const { data: convs, error: convErr } = await sb
      .from('conversations').select('id').eq('tenant_id', tenantId).in('customer_id', ids);
    if (convErr) {
      infraLogger.error({ err: convErr, tenantId }, 'LGPD export: falha ao consultar conversas do titular');
      return [];
    }
    const convIds = (convs ?? []).map((c: any) => c.id);
    if (convIds.length === 0) return [];
    const { data, error } = await sb
      .from('messages').select('*').eq('tenant_id', tenantId).in('conversation_id', convIds);
    if (error) {
      infraLogger.error({ err: error, tenantId }, 'LGPD export: falha ao consultar mensagens do titular');
      return [];
    }
    return data ?? [];
  },
};
