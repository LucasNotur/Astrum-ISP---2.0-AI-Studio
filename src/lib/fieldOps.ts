/**
 * PLANO I — camada de dados do app do técnico (frontend legado, permitido por R1).
 * Conversa com os endpoints do motor v2 (`apps/api/src/domain/campo/*`):
 *   GET  /api/v2/field/agenda
 *   POST /api/v2/field/os/:id/transition
 *   POST /api/v2/field/route/optimize
 *
 * Auth: o Bearer token vem do login PRÓPRIO do apps/api (JWT com iss/aud dedicados,
 * distinto do Supabase Auth — ver `src/lib/apiAuth.ts`). Chamar `getApiAccessToken()`
 * NÃO usar `supabase.auth.getSession()`: o Fastify rejeita token do Supabase Auth
 * na hora (assinatura/iss/aud não batem) e toda chamada aqui voltava 401.
 */

import { getApiAccessToken } from './apiAuth';

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

async function getAccessToken(): Promise<string> {
  return (await getApiAccessToken()) ?? '';
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
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
  const res = await fetch(`/api/v2/field/agenda${qs}`, { headers: await authHeaders() });
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
    headers: await authHeaders(),
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
  const res = await fetch('/api/v2/field/live', { headers: await authHeaders() });
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
  const res = await fetch(`/api/v2/field/reports/km${qs}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Report km HTTP ${res.status}`);
  return res.json();
}

export interface TempoReport { by_type: { type: string; avgMin: number; count: number }[]; sample: number }

export async function fetchTempoReport(): Promise<TempoReport> {
  const res = await fetch('/api/v2/field/reports/tempo', { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Report tempo HTTP ${res.status}`);
  return res.json();
}

export async function fetchDossie(osId: string): Promise<any> {
  const res = await fetch(`/api/v2/field/os/${osId}/dossie`, { headers: await authHeaders() });
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
  const res = await fetch('/api/v2/field/dispatch/board', { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Dispatch HTTP ${res.status}`);
  const data = await res.json();
  return data.board ?? [];
}

export async function assignOs(osId: string, technicianId: string): Promise<boolean> {
  const res = await fetch(`/api/v2/field/os/${osId}/assign`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ technicianId }),
  });
  return res.ok;
}

// ─── IA de campo (I-4) ───────────────────────────────────────────────────────

export interface PhotoValidationResult {
  valid: boolean;
  reason: string;
  classification: { equipment: string; issue: string; severity: string; confidence: number } | null;
}

/** Valida a foto "depois" pela visão IA (anti-"foto do chão"). */
export async function validatePhoto(osId: string, imageUrl: string, register = true): Promise<PhotoValidationResult> {
  const res = await fetch(`/api/v2/field/os/${osId}/validate-photo`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ image_url: imageUrl, register }),
  });
  if (!res.ok) throw new Error(`Validate photo HTTP ${res.status}`);
  return res.json();
}

/** Gera (e persiste) o resumo automático da OS. */
export async function generateSummary(osId: string): Promise<{ summary: string; source: 'llm' | 'fallback' }> {
  const res = await fetch(`/api/v2/field/os/${osId}/summary`, { method: 'POST', headers: await authHeaders() });
  if (!res.ok) throw new Error(`Summary HTTP ${res.status}`);
  return res.json();
}

// ─── Checklist ───────────────────────────────────────────────────────────────

export interface FieldChecklistItemFull extends FieldChecklistItem {
  item_key: string;
  required: boolean;
  done_at: string | null;
}

export async function fetchChecklist(osId: string): Promise<FieldChecklistItemFull[]> {
  const res = await fetch(`/api/v2/field/os/${osId}/checklist`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Checklist HTTP ${res.status}`);
  const data = await res.json();
  return (data.items ?? []).map((i: any) => ({
    id: i.id,
    item_key: i.item_key ?? '',
    text: i.label ?? i.item_key,
    required: i.required ?? false,
    done: i.done ?? false,
    done_at: i.done_at ?? null,
  }));
}

export async function markChecklistItem(osId: string, itemId: string, done: boolean): Promise<boolean> {
  const res = await fetch(`/api/v2/field/os/${osId}/checklist/${itemId}`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ done }),
  });
  return res.ok;
}

// ─── Mídia tipada ─────────────────────────────────────────────────────────────

export async function registerMedia(
  osId: string,
  opts: { kind: string; url: string; lat?: number; lng?: number; note?: string },
): Promise<string | null> {
  const res = await fetch(`/api/v2/field/os/${osId}/media`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      kind: opts.kind, url: opts.url,
      lat: opts.lat, lng: opts.lng,
      takenAt: new Date().toISOString(),
      note: opts.note,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.id ?? null;
}

export interface SignUploadResult { signedUrl: string; path: string; token: string }

export async function signUploadMedia(osId: string, kind: string, filename: string): Promise<SignUploadResult> {
  const res = await fetch(`/api/v2/field/os/${osId}/media/sign-upload`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ kind, filename }),
  });
  if (!res.ok) throw new Error(`Sign upload HTTP ${res.status}`);
  return res.json();
}

// ─── Localização GPS ─────────────────────────────────────────────────────────

export async function sendLocationBatch(
  shiftId: string | undefined,
  points: { lat: number; lng: number; recordedAt: string }[],
): Promise<void> {
  if (points.length === 0) return;
  const res = await fetch('/api/v2/field/location', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ shiftId, points }),
  });
  if (!res.ok) throw new Error(`Location batch HTTP ${res.status}`);
}

/** Otimiza a rota do dia e retorna a ordem + km estimado. */
export async function optimizeRoute(date?: string): Promise<OptimizedRouteResult> {
  const res = await fetch('/api/v2/field/route/optimize', {
    method: 'POST',
    headers: await authHeaders(),
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
