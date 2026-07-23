/**
 * PLANO I — camada de dados do app do técnico (frontend legado, permitido por R1).
 * Conversa com os endpoints do motor v2 (`apps/api/src/domain/campo/*`):
 *   GET  /api/v2/field/agenda
 *   POST /api/v2/field/os/:id/transition
 *   POST /api/v2/field/route/optimize
 *
 * Mantém o padrão de auth já usado na página (bearer token no localStorage).
 */

export type FieldOsStatus = 'pending' | 'in_progress' | 'completed';

export interface FieldChecklistItem { id: string; text: string; done: boolean }

export interface FieldOs {
  id: string;                 // UUID real da service_order
  title: string;
  client: string;
  address: string;
  scheduledTime: string;
  status: FieldOsStatus;
  type: string;
  latitude?: number | null;
  longitude?: number | null;
  checklist: FieldChecklistItem[];
}

export interface OptimizedRouteResult {
  date: string;
  routePlanId?: string;
  totalKm: number;
  stops: { position: number; serviceOrderId: string }[];
}

export interface TransitionResult {
  ok: boolean;
  status?: string;
  error?: string;
  missing?: string[];
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('sb-access-token') ?? '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

/** Mapeia o status persistido (pt-BR/en) para o modelo simples da tela. */
export function mapOsStatus(raw: string): FieldOsStatus {
  switch (raw) {
    case 'concluido':
    case 'completed':
    case 'cancelado':
    case 'cancelled':
      return 'completed';
    case 'em_deslocamento':
    case 'em_atendimento':
    case 'in_progress':
      return 'in_progress';
    default:
      return 'pending';
  }
}

function normalizeOrder(o: any): FieldOs {
  const scheduled = o.scheduled_for ?? o.time_window_start ?? null;
  const scheduledTime = scheduled
    ? new Date(scheduled).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  return {
    id: o.id,
    title: o.type ? `${o.type}${o.description ? ' — ' + o.description : ''}` : (o.description ?? 'Ordem de Serviço'),
    client: o.customer_name ?? 'Cliente',
    address: o.address ?? '',
    scheduledTime,
    status: mapOsStatus(o.status ?? 'pendente'),
    type: o.type ?? 'servico',
    latitude: o.latitude,
    longitude: o.longitude,
    checklist: [],
  };
}

/** Carrega a agenda do técnico logado. Lança em erro de rede/HTTP. */
export async function fetchAgenda(date?: string): Promise<FieldOs[]> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetch(`/api/v2/field/agenda${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Agenda HTTP ${res.status}`);
  const data = await res.json();
  return (data.orders ?? []).map(normalizeOrder);
}

/** Aplica um evento da máquina de estados a uma OS. */
export async function transitionOs(
  osId: string,
  event: string,
  opts: { lat?: number; lng?: number; metadata?: Record<string, unknown>; completion?: unknown } = {},
): Promise<TransitionResult> {
  const res = await fetch(`/api/v2/field/os/${osId}/transition`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ event, lat: opts.lat, lng: opts.lng, metadata: opts.metadata, completion: opts.completion }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, status: body.status };
  return { ok: false, error: body.message ?? `HTTP ${res.status}`, missing: body.missing };
}

/**
 * "Iniciar atendimento": avança a OS por aceita → a_caminho → chegou → iniciada.
 * Tolera 409 (etapa já ultrapassada) para ser idempotente — o técnico dá 1 toque.
 */
export async function startServiceOrder(osId: string, geo: { lat?: number; lng?: number } = {}): Promise<TransitionResult> {
  const sequence = ['aceita', 'a_caminho', 'chegou', 'iniciada'];
  let last: TransitionResult = { ok: true };
  for (const event of sequence) {
    const r = await transitionOs(osId, event, geo);
    // 409 = transição inválida a partir da fase atual (já passou dessa etapa): segue.
    if (!r.ok && !r.missing) continue;
    if (!r.ok) return r; // erro real (ex.: gate) — interrompe
    last = r;
  }
  return last;
}

/** Conclui a OS aplicando o gate (checklist/foto/assinatura ou justificativa). */
export async function completeServiceOrder(
  osId: string,
  completion: { checklistTotal: number; checklistDone: number; photosDepois: number; hasSignature: boolean; justification?: string },
  geo: { lat?: number; lng?: number } = {},
): Promise<TransitionResult> {
  return transitionOs(osId, 'concluida', { ...geo, completion });
}

// ─── Gestor (I-3) ────────────────────────────────────────────────────────────

export interface LiveTechnician {
  technician_id: string;
  name: string;
  status: string;
  vehicle?: string | null;
  plate?: string | null;
  last_location: { latitude: number; longitude: number; recorded_at: string } | null;
  active_orders: number;
}

export async function fetchLive(): Promise<LiveTechnician[]> {
  const res = await fetch('/api/v2/field/live', { headers: authHeaders() });
  if (!res.ok) throw new Error(`Live HTTP ${res.status}`);
  const data = await res.json();
  return data.technicians ?? [];
}

export interface KmReport { by_day: { day: string; km: number }[]; total_km: number }

export async function fetchKmReport(from?: string, to?: string): Promise<KmReport> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`/api/v2/field/reports/km${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Report km HTTP ${res.status}`);
  return res.json();
}

export interface TempoReport { by_type: { type: string; avgMin: number; count: number }[]; sample: number }

export async function fetchTempoReport(): Promise<TempoReport> {
  const res = await fetch('/api/v2/field/reports/tempo', { headers: authHeaders() });
  if (!res.ok) throw new Error(`Report tempo HTTP ${res.status}`);
  return res.json();
}

export async function fetchDossie(osId: string): Promise<any> {
  const res = await fetch(`/api/v2/field/os/${osId}/dossie`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Dossiê HTTP ${res.status}`);
  return res.json();
}

export interface DispatchSuggestion {
  technician_id: string;
  name: string;
  score: number;
  distance_km: number | null;
  skill_match: boolean;
  active_orders: number;
  reasons: string[];
}

export interface DispatchBoardItem {
  service_order_id: string;
  customer_name: string;
  address: string;
  type: string;
  assigned_to: string | null;
  suggestions: DispatchSuggestion[];
}

export async function fetchDispatchBoard(): Promise<DispatchBoardItem[]> {
  const res = await fetch('/api/v2/field/dispatch/board', { headers: authHeaders() });
  if (!res.ok) throw new Error(`Dispatch HTTP ${res.status}`);
  const data = await res.json();
  return data.board ?? [];
}

export async function assignOs(osId: string, technicianId: string): Promise<boolean> {
  const res = await fetch(`/api/v2/field/os/${osId}/assign`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ technicianId }),
  });
  return res.ok;
}

/** Otimiza a rota do dia e retorna a ordem + km estimado. */
export async function optimizeRoute(date?: string): Promise<OptimizedRouteResult> {
  const res = await fetch('/api/v2/field/route/optimize', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ date }),
  });
  if (!res.ok) throw new Error(`Otimização HTTP ${res.status}`);
  const data = await res.json();
  return {
    date: data.date,
    routePlanId: data.route_plan_id,
    totalKm: data.total_km ?? 0,
    stops: (data.stops ?? []).map((s: any) => ({ position: s.position, serviceOrderId: s.service_order_id })),
  };
}
