/**
 * S99 — Supabase real-time data layer.
 * Drop-in replacement for src/lib/db.ts functions used in App.tsx.
 * Each function returns an unsubscribe callback matching the Firestore onSnapshot signature.
 */
import { supabase } from './supabase';
import { applyShapeCompat } from './shape-compat';

type Unsub = () => void;

// ─── helpers ──────────────────────────────────────────────────────────────────

let channelSeq = 0;
function channel(name: string) {
  // Sufixo único por assinatura: o supabase-js reutiliza canais com o mesmo topic,
  // e adicionar callbacks a um canal já inscrito lança
  // "cannot add `postgres_changes` callbacks ... after `subscribe()`".
  return supabase.channel(`${name}:${++channelSeq}`);
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
  // F1-03 — ponto único de compat de shape: adiciona aliases Firestore-shape
  // (amount/mrr/plan/subject/dueDate.seconds/lat/lng/usedPorts…) sem remover os
  // campos reais, pra as telas legadas lerem o dado REAL do Supabase.
  if (!error && data) callback(applyShapeCompat(table, data) as T[]);
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
//
// F1-AUD/realtime-fix — a thread de mensagens do ticket usa `conversation_id`
// (não `ticket_id`, coluna que nunca existiu — ver migration 116) via
// GET/POST /api/v2/tickets/:id/messages, e o realtime é o WebSocket nativo
// real (/ws/conversations/:id) — não o socket.io-client antigo, que apontava
// pra um servidor Socket.IO que nunca existiu no backend.

function dbRoleToSenderType(role: string, fromAi: boolean): 'customer' | 'ai' | 'human' | 'system' {
  if (role === 'user') return 'customer';
  if (role === 'system') return 'system';
  return fromAi ? 'ai' : 'human';
}

function transformMessageRow(row: any) {
  return {
    id: row.id,
    content: row.content,
    text: row.content, // alias — o modal de ticket do App.tsx lê `m.text`, o ChatPage lê `m.content`
    senderType: dbRoleToSenderType(row.role, !!row.from_ai),
    is_internal: !!row.extra?.isInternal,
    attachment: row.extra?.attachment ?? null,
    createdAt: row.created_at,
  };
}

function wsUrlFor(path: string, token: string): string {
  const base = (typeof window !== 'undefined' && window.location.origin) || '';
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}${path}?token=${encodeURIComponent(token)}`;
}

/** Abre o WS de uma conversa e escuta `new_message`. Chama `onMessage` a cada uma. */
async function connectConversationSocket(
  conversationId: string,
  onMessage: (row: any) => void,
): Promise<WebSocket | null> {
  const { getApiAccessToken } = await import('./apiAuth');
  const token = await getApiAccessToken();
  if (!token) return null;

  const ws = new WebSocket(wsUrlFor(`/ws/conversations/${conversationId}`, token));
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.type !== 'new_message') return;
      onMessage({
        id: data.id,
        role: data.role,
        content: data.content,
        from_ai: data.fromAi,
        extra: { isInternal: data.isInternal, attachment: data.attachment },
        created_at: data.timestamp,
      });
    } catch {
      // ignora eventos malformados
    }
  };
  return ws;
}

export function getMessages(
  ticketId: string,
  callback: (messages: any[]) => void,
): Unsub {
  let closed = false;
  let ws: WebSocket | null = null;
  let list: any[] = [];

  (async () => {
    const { apiGet } = await import('./apiClient');
    let res: { messages: any[]; conversationId: string | null };
    try {
      res = await apiGet(`/api/v2/tickets/${ticketId}/messages`);
    } catch (err) {
      console.error('getMessages', err);
      return;
    }
    if (closed) return;

    list = res.messages.map(transformMessageRow);
    callback(list);
    if (!res.conversationId) return;

    ws = await connectConversationSocket(res.conversationId, (row) => {
      if (list.some((m) => m.id === row.id)) return; // já veio no fetch inicial
      list = [...list, transformMessageRow(row)];
      callback(list);
    });
    if (closed) ws?.close();
  })();

  return () => {
    closed = true;
    ws?.close();
  };
}

export async function sendMessage(
  ticketId: string,
  text: string,
  senderType: 'customer' | 'ai' | 'human' | 'system',
  _category?: string,
  attachment?: { url: string; type: string; name?: string; base64?: string },
  opts?: { isInternal?: boolean },
) {
  const { apiPost } = await import('./apiClient');
  try {
    const { message } = await apiPost<{ message: any; conversationId: string }>(
      `/api/v2/tickets/${ticketId}/messages`,
      {
        content: text,
        isInternal: !!opts?.isInternal,
        role: senderType === 'system' ? 'system' : 'assistant',
        ...(attachment ? { attachment: { url: attachment.url, type: attachment.type, name: (attachment as any).name } } : {}),
      },
    );
    return message;
  } catch (err) {
    console.error('sendMessage', err);
    return null;
  }
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

// ─── Operators (JSONB array na linha do tenant — mesmo storage do backend/db-compat) ──

export async function upsertTenantOperator(
  tenantId: string,
  operatorId: string,
  data: Record<string, any>,
) {
  const { data: row } = await supabase
    .from('tenants').select('operators').eq('id', tenantId).maybeSingle();
  const ops: any[] = Array.isArray(row?.operators) ? [...row!.operators] : [];
  const idx = ops.findIndex(o => o?.id === operatorId);
  const item = { ...(idx >= 0 ? ops[idx] : {}), ...data, id: operatorId };
  if (idx >= 0) ops[idx] = item; else ops.push(item);
  const { error } = await supabase.from('tenants').update({ operators: ops }).eq('id', tenantId);
  if (error) console.error('upsertTenantOperator', error);
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
