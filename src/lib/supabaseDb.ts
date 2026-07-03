/**
 * S99 — Supabase real-time data layer.
 * Drop-in replacement for src/lib/db.ts functions used in App.tsx.
 * Each function returns an unsubscribe callback matching the Firestore onSnapshot signature.
 */
import { supabase } from './supabase';

type Unsub = () => void;

// ─── helpers ──────────────────────────────────────────────────────────────────

function channel(name: string) {
  return supabase.channel(name);
}

async function fetchAndNotify<T>(
  table: string,
  tenantId: string | undefined,
  callback: (rows: T[]) => void,
  opts: { orderBy?: string; orderDir?: 'asc' | 'desc'; limit?: number } = {},
) {
  let q = supabase.from(table).select('*');
  if (tenantId && tenantId !== 'default') q = q.eq('tenant_id', tenantId);
  if (opts.orderBy) q = q.order(opts.orderBy, { ascending: opts.orderDir !== 'desc' });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (!error && data) callback(data as T[]);
}

// ─── Customers ────────────────────────────────────────────────────────────────

export function getCustomers(
  callback: (customers: any[]) => void,
  tenantId = 'default',
): Unsub {
  fetchAndNotify('customers', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc', limit: 150 });

  const ch = channel(`customers:${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () => {
      fetchAndNotify('customers', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc', limit: 150 });
    })
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

export async function updateCustomer(customerId: string, data: any) {
  const { error } = await supabase.from('customers').update(data).eq('id', customerId);
  if (error) console.error('updateCustomer', error);
}

export async function createCustomer(data: any) {
  const { data: row, error } = await supabase.from('customers').insert(data).select().single();
  if (error) throw error;
  return row.id;
}

export async function deleteCustomer(id: string) {
  await supabase.from('customers').delete().eq('id', id);
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export function getTickets(
  callback: (tickets: any[]) => void,
  tenantId = 'default',
): Unsub {
  fetchAndNotify('tickets', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc', limit: 200 });

  const ch = channel(`tickets:${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
      fetchAndNotify('tickets', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc', limit: 200 });
    })
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

export async function createTicket(customerId: string, subject: string, tenantId = 'default') {
  const { data, error } = await supabase.from('tickets').insert({
    customer_id: customerId,
    subject,
    status: 'open',
    priority: 'medium',
    ai_enabled: true,
    tenant_id: tenantId,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateTicketStatus(ticketId: string, status: string) {
  const updates: any = { status };
  if (status === 'resolved') updates.resolved_at = new Date().toISOString();
  const { error } = await supabase.from('tickets').update(updates).eq('id', ticketId);
  if (error) console.error('updateTicketStatus', error);
}

export async function toggleTicketAI(ticketId: string, enabled: boolean) {
  await supabase.from('tickets').update({ ai_enabled: enabled }).eq('id', ticketId);
}

export async function deleteTicket(id: string) {
  await supabase.from('tickets').delete().eq('id', id);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function getMessages(
  ticketId: string,
  callback: (messages: any[]) => void,
): Unsub {
  const load = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (data) callback(data);
  };
  load();

  const ch = channel(`messages:${ticketId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `ticket_id=eq.${ticketId}` }, load)
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

export async function sendMessage(
  ticketId: string,
  text: string,
  senderType: 'customer' | 'ai' | 'human' | 'system',
  category?: string,
  attachment?: { url: string; type: string; base64?: string },
) {
  const { data, error } = await supabase.from('messages').insert({
    ticket_id: ticketId,
    sender_type: senderType,
    body: text,
    category: category ?? null,
    attachment: attachment ?? null,
  }).select().single();
  if (error) console.error('sendMessage', error);
  return data;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export function getInvoices(
  callback: (invoices: any[]) => void,
  tenantId = 'default',
): Unsub {
  fetchAndNotify('invoices', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc', limit: 300 });

  const ch = channel(`invoices:${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
      fetchAndNotify('invoices', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc', limit: 300 });
    })
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

export async function createInvoice(data: any) {
  const { data: row, error } = await supabase.from('invoices').insert(data).select().single();
  if (error) throw error;
  return row.id;
}

// ─── Network CTOs ─────────────────────────────────────────────────────────────

export function getNetworkCTOs(
  callback: (ctos: any[]) => void,
  tenantId = 'default',
): Unsub {
  fetchAndNotify('network_ctos', tenantId, callback, {});

  const ch = channel(`network_ctos:${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'network_ctos' }, () => {
      fetchAndNotify('network_ctos', tenantId, callback, {});
    })
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export function getAuditLogs(
  callback: (logs: any[]) => void,
  tenantId = 'default',
): Unsub {
  fetchAndNotify('audit_log', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc', limit: 50 });

  const ch = channel(`audit_log:${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log' }, () => {
      fetchAndNotify('audit_log', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc', limit: 50 });
    })
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

export async function logAudit(action: string, details: any, tenantId = 'default') {
  await supabase.from('audit_log').insert({ action, details, tenant_id: tenantId });
}

// ─── Technicians ──────────────────────────────────────────────────────────────

export function getTechnicians(
  callback: (techs: any[]) => void,
  tenantId = 'default',
): Unsub {
  fetchAndNotify('technicians', tenantId, callback, {});

  const ch = channel(`technicians:${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'technicians' }, () => {
      fetchAndNotify('technicians', tenantId, callback, {});
    })
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

export async function createTechnician(data: any, tenantId = 'default') {
  const { data: row, error } = await supabase.from('technicians').insert({ ...data, tenant_id: tenantId }).select().single();
  if (error) throw error;
  return row.id;
}

export async function updateTechnician(id: string, data: any) {
  await supabase.from('technicians').update(data).eq('id', id);
}

// ─── Service Orders ───────────────────────────────────────────────────────────

export function getServiceOrders(
  callback: (orders: any[]) => void,
  tenantId = 'default',
): Unsub {
  fetchAndNotify('service_orders', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc' });

  const ch = channel(`service_orders:${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'service_orders' }, () => {
      fetchAndNotify('service_orders', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc' });
    })
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

export async function createServiceOrder(data: any) {
  const { data: row, error } = await supabase.from('service_orders').insert(data).select().single();
  if (error) throw error;
  return row.id;
}

export async function updateServiceOrder(id: string, data: any) {
  const { error } = await supabase.from('service_orders').update(data).eq('id', id);
  if (error) throw error;
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export function getInventory(
  callback: (inventory: any[]) => void,
  tenantId = 'default',
): Unsub {
  fetchAndNotify('inventory', tenantId, callback, {});

  const ch = channel(`inventory:${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
      fetchAndNotify('inventory', tenantId, callback, {});
    })
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

// ─── Team Members ─────────────────────────────────────────────────────────────

export function getTeamMembers(
  callback: (members: any[]) => void,
  tenantId = 'default',
): Unsub {
  fetchAndNotify('team_members', tenantId, callback, {});

  const ch = channel(`team_members:${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, () => {
      fetchAndNotify('team_members', tenantId, callback, {});
    })
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

// ─── Notifications ────────────────────────────────────────────────────────────

export function getNotifications(
  callback: (notifications: any[]) => void,
  tenantId = 'default',
): Unsub {
  fetchAndNotify('notifications', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc', limit: 20 });

  const ch = channel(`notifications:${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
      fetchAndNotify('notifications', tenantId, callback, { orderBy: 'created_at', orderDir: 'desc', limit: 20 });
    })
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

// ─── Knowledge Articles ───────────────────────────────────────────────────────

export function getKnowledgeBase(
  callback: (articles: any[]) => void,
  tenantId = 'default',
): Unsub {
  fetchAndNotify('knowledge_articles', tenantId, callback, {});

  const ch = channel(`knowledge_articles:${tenantId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'knowledge_articles' }, () => {
      fetchAndNotify('knowledge_articles', tenantId, callback, {});
    })
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

// ─── Role / Resource Permissions ──────────────────────────────────────────────

export function getRolePermissions(
  callback: (roles: Record<string, any>) => void,
): Unsub {
  const load = async () => {
    const { data } = await supabase.from('role_permissions').select('*');
    if (!data) return;
    const map: Record<string, any> = {};
    for (const row of data) {
      if (row.role_name && row.permissions) map[row.role_name] = row.permissions;
    }
    callback(map);
  };
  load();

  const ch = channel('role_permissions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'role_permissions' }, load)
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

// ─── Tenant settings (company) ────────────────────────────────────────────────

export function getTenantSettings(
  tenantId: string,
  callback: (settings: any) => void,
): Unsub {
  const load = async () => {
    const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    if (data) callback(data);
  };
  load();

  const ch = channel(`tenants:${tenantId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tenants', filter: `id=eq.${tenantId}` }, load)
    .subscribe();

  return () => { supabase.removeChannel(ch); };
}

// ─── Integration Keys (stored in tenants row) ─────────────────────────────────

export async function getIntegrationKeys(tenantId?: string): Promise<Record<string, string>> {
  if (!tenantId || tenantId === 'default') return {};
  const { data } = await supabase.from('tenants').select('integration_keys').eq('id', tenantId).maybeSingle();
  return (data?.integration_keys as Record<string, string>) ?? {};
}

// ─── AI token logs ────────────────────────────────────────────────────────────

export async function getAiTokenLogs(tenantId: string, limit = 100) {
  const { data } = await supabase
    .from('ai_performance_logs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ─── Departments (scoped under tenant) ───────────────────────────────────────

export async function getDepartments(tenantId: string) {
  const { data } = await supabase
    .from('tickets') // departments stored inline or as tenant JSON
    .select('department_id')
    .eq('tenant_id', tenantId)
    .not('department_id', 'is', null);
  return data ?? [];
}
