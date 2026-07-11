/**
 * ETL Transform — funções puras de mapeamento Firestore (legado) → Supabase (alvo).
 *
 * Plano Mestre V2, S69. Concentra AQUI toda a lógica de risco do backfill:
 * conversão de unidade monetária, mapeamento de enums divergentes e chaveamento
 * idempotente. São funções puras (sem I/O) exatamente para serem 100% testáveis —
 * um erro de centavos ou de enum aqui é risco financeiro/operacional.
 *
 * Referência campo-a-campo: docs/DB_MIGRATION_GAP_REPORT.md
 */

// ─── Dinheiro ────────────────────────────────────────────────────────────────

/**
 * Converte reais (number, como no Firestore) para centavos (INTEGER, como no alvo).
 * Usa arredondamento bancário simples via Math.round para evitar o erro clássico
 * de ponto flutuante (ex.: 19.99 * 100 = 1998.9999...). NUNCA truncar.
 */
export function reaisToCents(reais: number | null | undefined): number {
  if (reais == null || Number.isNaN(reais)) return 0;
  if (!Number.isFinite(reais)) throw new Error(`Valor monetário inválido: ${reais}`);
  return Math.round(reais * 100);
}

// ─── Enums ───────────────────────────────────────────────────────────────────

const CUSTOMER_STATUS_MAP: Record<string, 'active' | 'suspended' | 'cancelled'> = {
  active: 'active',
  inactive: 'suspended',
  pending: 'active',
  suspended: 'suspended',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

export function mapCustomerStatus(legacy: string | null | undefined): 'active' | 'suspended' | 'cancelled' {
  const key = (legacy ?? '').trim().toLowerCase();
  return CUSTOMER_STATUS_MAP[key] ?? 'active';
}

const TICKET_STATUS_MAP: Record<string, string> = {
  open: 'open',
  'in-progress': 'in_progress',
  in_progress: 'in_progress',
  resolved: 'resolved',
  closed: 'closed',
  escalated: 'escalated',
};

export function mapTicketStatus(legacy: string | null | undefined): string {
  const key = (legacy ?? '').trim().toLowerCase();
  return TICKET_STATUS_MAP[key] ?? 'open';
}

const TICKET_PRIORITY_MAP: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  urgent: 'critical',
  critical: 'critical',
};

export function mapTicketPriority(legacy: string | null | undefined): 'low' | 'medium' | 'high' | 'critical' {
  const key = (legacy ?? '').trim().toLowerCase();
  return TICKET_PRIORITY_MAP[key] ?? 'medium';
}

/** Mensagens: senderType legado (customer/ai/human) → role + from_ai do alvo. */
export function mapMessageRole(senderType: string | null | undefined): { role: 'user' | 'assistant' | 'system'; fromAi: boolean } {
  switch ((senderType ?? '').trim().toLowerCase()) {
    case 'customer': return { role: 'user', fromAi: false };
    case 'ai':       return { role: 'assistant', fromAi: true };
    case 'human':    return { role: 'assistant', fromAi: false };
    case 'system':   return { role: 'system', fromAi: false };
    default:         return { role: 'user', fromAi: false };
  }
}

// ─── Builders de linha (idempotentes por legacy_id) ──────────────────────────

export interface LegacyCustomer {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  cpf?: string;
  address?: string;
  mrr?: number;
  status?: string;
  retention_discount_used_at?: string;
  createdAt?: string;
}

/** Monta a linha de `customers` no alvo. `legacy_id` é a chave de idempotência do upsert. */
export function buildCustomerRow(tenantId: string, c: LegacyCustomer): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    legacy_id: c.id,
    name: c.name ?? 'Sem nome',
    email: c.email ?? null,
    phone: c.phone ?? null,
    cpf: c.cpf ?? null,
    address: c.address ?? null,
    mrr_cents: reaisToCents(c.mrr),
    status: mapCustomerStatus(c.status),
    retention_discount_used_at: c.retention_discount_used_at ?? null,
    created_at: c.createdAt ?? new Date().toISOString(),
  };
}

export interface LegacyInvoice {
  id: string;
  customerId: string;
  amount?: number;      // reais
  dueDate?: string;
  status?: string;
  paymentUrl?: string;
  pixCopyPaste?: string;
  createdAt?: string;
}

/**
 * Monta a linha de `invoices`. Preserva payment_url e pix_copy_paste (críticos — a IA
 * usa para enviar 2ª via). Requer o mapa legacy_customer_id → uuid já resolvido.
 */
export function buildInvoiceRow(
  tenantId: string,
  inv: LegacyInvoice,
  customerUuid: string | null,
): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    legacy_id: inv.id,
    customer_id: customerUuid,
    amount_cents: reaisToCents(inv.amount),
    due_date: inv.dueDate ?? null,
    status: (inv.status ?? 'pending').toLowerCase(),
    payment_url: inv.paymentUrl ?? null,
    pix_copy_paste: inv.pixCopyPaste ?? null,
    created_at: inv.createdAt ?? new Date().toISOString(),
  };
}

/**
 * ARMADILHA do gap report: o `audit_logs` legado (métricas de IA/SLA) NÃO pode ir
 * para `audit_log` (trilha de segurança). Vai para `ai_performance_logs`.
 * Esta função existe para deixar a decisão explícita e testável.
 */
export function auditLogTargetTable(): 'ai_performance_logs' {
  return 'ai_performance_logs';
}

// ─── network_ctos ────────────────────────────────────────────────────────────

export interface LegacyNetworkCto {
  id: string;
  name?: string;
  lat?: number; latitude?: number;
  lng?: number; longitude?: number;
  totalPorts?: number; total_ports?: number;
  usedPorts?: number; used_ports?: number;
  status?: string;
  createdAt?: string;
}

function mapCtoStatus(s: string | null | undefined): 'active' | 'full' | 'maintenance' {
  switch ((s ?? '').toLowerCase()) {
    case 'full': return 'full';
    case 'maintenance': return 'maintenance';
    default: return 'active';
  }
}

export function buildNetworkCtoRow(tenantId: string, c: LegacyNetworkCto): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    legacy_id: c.id,
    name: c.name ?? 'CTO sem nome',
    latitude: c.lat ?? c.latitude ?? 0,
    longitude: c.lng ?? c.longitude ?? 0,
    total_ports: c.totalPorts ?? c.total_ports ?? 0,
    used_ports: c.usedPorts ?? c.used_ports ?? 0,
    status: mapCtoStatus(c.status),
    created_at: c.createdAt ?? new Date().toISOString(),
  };
}

// ─── technicians ─────────────────────────────────────────────────────────────

export interface LegacyTechnician {
  id: string;
  name?: string;
  phone?: string;
  status?: string;
  currentTask?: string; current_task?: string;
  createdAt?: string;
}

function mapTechStatus(s: string | null | undefined): 'available' | 'break' | 'offline' {
  switch ((s ?? '').toLowerCase()) {
    case 'available': return 'available';
    case 'break': case 'pausa': return 'break';
    default: return 'offline';
  }
}

export function buildTechnicianRow(tenantId: string, t: LegacyTechnician): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    legacy_id: t.id,
    name: t.name ?? 'Sem nome',
    phone: t.phone ?? '',
    status: mapTechStatus(t.status),
    current_task: t.currentTask ?? t.current_task ?? null,
    created_at: t.createdAt ?? new Date().toISOString(),
  };
}

// ─── inventory ───────────────────────────────────────────────────────────────

export interface LegacyInventoryItem {
  id: string;
  name?: string;
  category?: string;
  stock?: number;
  minStock?: number; min_stock?: number;
  unit?: string;
  price?: number;        // reais
  createdAt?: string;
}

export function buildInventoryRow(tenantId: string, i: LegacyInventoryItem): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    legacy_id: i.id,
    name: i.name ?? 'Item sem nome',
    category: i.category ?? 'geral',
    stock: i.stock ?? 0,
    min_stock: i.minStock ?? i.min_stock ?? 0,
    unit: i.unit ?? null,
    price_cents: reaisToCents(i.price),
    created_at: i.createdAt ?? new Date().toISOString(),
  };
}

// ─── notifications ───────────────────────────────────────────────────────────

const NOTIF_TYPE_MAP: Record<string, 'SLA_BREACH' | 'CRITICAL_ESCALATION' | 'SYSTEM_ERROR'> = {
  sla_breach: 'SLA_BREACH',
  sla: 'SLA_BREACH',
  critical_escalation: 'CRITICAL_ESCALATION',
  escalation: 'CRITICAL_ESCALATION',
  system_error: 'SYSTEM_ERROR',
  error: 'SYSTEM_ERROR',
};

export interface LegacyNotification {
  id: string;
  type?: string;
  message?: string;
  ticketId?: string; ticket_id?: string;
  timestamp?: string;
  createdAt?: string;
}

export function buildNotificationRow(
  tenantId: string,
  n: LegacyNotification,
  ticketUuid: string | null,
): Record<string, unknown> {
  const key = (n.type ?? '').trim().toLowerCase();
  const type = NOTIF_TYPE_MAP[key] ?? 'SYSTEM_ERROR';
  return {
    tenant_id: tenantId,
    legacy_id: n.id,
    type,
    message: n.message ?? '',
    ticket_id: ticketUuid,
    created_at: n.timestamp ?? n.createdAt ?? new Date().toISOString(),
  };
}

// ─── team_members ─────────────────────────────────────────────────────────────

const TEAM_ROLE_MAP: Record<string, string> = {
  admin: 'admin',
  owner: 'owner',
  support: 'support',
  billing: 'billing',
  sales: 'sales',
  atendente: 'atendente',
  agent: 'support',
  manager: 'admin',
};

export interface LegacyTeamMember {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  createdAt?: string;
}

export function buildTeamMemberRow(tenantId: string, m: LegacyTeamMember): Record<string, unknown> {
  const role = TEAM_ROLE_MAP[(m.role ?? '').toLowerCase()] ?? 'support';
  const status = (m.status ?? 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';
  return {
    tenant_id: tenantId,
    legacy_id: m.id,
    name: m.name ?? 'Sem nome',
    email: m.email ?? null,
    role,
    status,
    created_at: m.createdAt ?? new Date().toISOString(),
  };
}

// ─── service_orders ──────────────────────────────────────────────────────────

const SO_STATUS_MAP: Record<string, string> = {
  pendente: 'pendente',
  pending: 'pendente',
  open: 'pendente',
  em_deslocamento: 'em_deslocamento',
  in_transit: 'em_deslocamento',
  em_atendimento: 'em_atendimento',
  in_progress: 'em_atendimento',
  concluido: 'concluido',
  completed: 'concluido',
  done: 'concluido',
  cancelado: 'cancelado',
  cancelled: 'cancelado',
  canceled: 'cancelado',
};

export interface LegacyServiceOrder {
  id: string;
  customerId?: string; customer_id?: string;
  address?: string;
  lat?: number; latitude?: number;
  lng?: number; longitude?: number;
  status?: string;
  type?: string;
  description?: string;
  cto?: string;
  port?: number;
  materials?: string[];
  assignedTo?: string; assigned_to?: string;
  aiSummary?: string; ai_summary?: string;
  createdAt?: string;
}

export function buildServiceOrderRow(
  tenantId: string,
  o: LegacyServiceOrder,
  customerUuid: string | null,
  techUuid: string | null,
  ctoUuid: string | null,
): Record<string, unknown> {
  return {
    tenant_id: tenantId,
    legacy_id: o.id,
    customer_id: customerUuid,
    address: o.address ?? null,
    latitude: o.lat ?? o.latitude ?? null,
    longitude: o.lng ?? o.longitude ?? null,
    status: SO_STATUS_MAP[(o.status ?? '').toLowerCase()] ?? 'pendente',
    type: o.type ?? 'instalacao',
    description: o.description ?? null,
    cto_id: ctoUuid,
    cto_legacy: ctoUuid ? null : (o.cto ?? null),
    port: o.port ?? null,
    materials: o.materials ?? [],
    assigned_to: techUuid,
    ai_summary: o.aiSummary ?? o.ai_summary ?? null,
    created_at: o.createdAt ?? new Date().toISOString(),
  };
}
