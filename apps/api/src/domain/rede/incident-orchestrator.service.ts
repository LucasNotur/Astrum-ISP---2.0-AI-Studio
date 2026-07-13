/**
 * D-04 Fase 1 — NOC AUTÔNOMO: orquestrador de incidentes de rede.
 *
 * Máquina de estados: suspeita → confirmada → comunicada → normalizada
 * (cancelada de qualquer estado não-terminal). A detecção nasce da telemetria
 * (detectAnomalies IA-24 sobre network_metrics); a comunicação escreve em
 * outage_notifications (P1-02 — o canal real envia a partir dali).
 *
 * Flag NOC_AUTONOMO_ENABLED (default OFF). Aprovação humana no passo
 * "comunicar" é o padrão — auto_communicate por tenant fica para a Fase 2.
 * Ports injetáveis: roda no tenant demo hoje, calibra com rede real depois.
 */
import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';
import { detectAnomalies, anomalySeverity, type DataPoint } from './anomaly';

export function isNocAutonomoEnabled(): boolean {
  return (process.env.NOC_AUTONOMO_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export type IncidentStatus = 'suspeita' | 'confirmada' | 'comunicada' | 'normalizada' | 'cancelada';

const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  suspeita: ['confirmada', 'cancelada'],
  confirmada: ['comunicada', 'normalizada', 'cancelada'],
  comunicada: ['normalizada', 'cancelada'],
  normalizada: [],
  cancelada: [],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

const STATUS_TIMESTAMP: Partial<Record<IncidentStatus, string>> = {
  confirmada: 'confirmed_at',
  comunicada: 'communicated_at',
  normalizada: 'normalized_at',
};

export interface IncidentPorts {
  db: typeof supabase;
}
export const defaultPorts: IncidentPorts = { db: supabase };

// ── Detecção: telemetria → incidentes "suspeita" ─────────────────────────────

/**
 * Varre a telemetria recente por CTO e abre incidente 'suspeita' onde a série
 * apresenta anomalia (IA-24). Dedupe: 1 incidente aberto por CTO.
 */
export async function scanForIncidents(
  tenantId: string,
  ports: IncidentPorts = defaultPorts,
  opts: { metric?: string; lookbackDays?: number; minPoints?: number } = {},
): Promise<{ opened: number; anomalousCtos: string[] }> {
  const metric = opts.metric ?? 'latency_ms';
  const since = new Date(Date.now() - (opts.lookbackDays ?? 45) * 86400000).toISOString();

  const { data: metrics, error } = await ports.db
    .from('network_metrics')
    .select('cto_id, value, collected_at')
    .eq('tenant_id', tenantId)
    .eq('metric', metric)
    .gte('collected_at', since)
    .order('collected_at', { ascending: true });
  if (error) throw new Error(`D-04 scan: ${error.message}`);

  const byCto = new Map<string, DataPoint[]>();
  for (const row of metrics ?? []) {
    if (!row.cto_id) continue;
    if (!byCto.has(row.cto_id)) byCto.set(row.cto_id, []);
    byCto.get(row.cto_id)!.push({ t: row.collected_at as string, v: Number(row.value) });
  }

  const { data: openIncidents } = await ports.db
    .from('incidents')
    .select('cto_id')
    .eq('tenant_id', tenantId)
    .in('status', ['suspeita', 'confirmada', 'comunicada']);
  const alreadyOpen = new Set((openIncidents ?? []).map((i: any) => i.cto_id));

  const anomalousCtos: string[] = [];
  let opened = 0;
  for (const [ctoId, points] of byCto) {
    const { anomalies } = detectAnomalies(points, { minPoints: opts.minPoints ?? 30 });
    // Só interessa anomalia RECENTE (últimos 20% da série) — histórico velho não abre incidente.
    const cutoff = points[Math.floor(points.length * 0.8)]!.t;
    const recent = anomalies.filter((a) => a.t >= cutoff);
    if (!recent.length) continue;
    anomalousCtos.push(ctoId);
    if (alreadyOpen.has(ctoId)) continue;

    const worstZ = Math.max(...recent.map((a) => Math.abs(a.z)));
    const { error: insErr } = await ports.db.from('incidents').insert({
      tenant_id: tenantId,
      cto_id: ctoId,
      status: 'suspeita',
      severity: anomalySeverity(worstZ),
      title: `Anomalia de ${metric} detectada`,
      source: 'anomaly',
      extra: { metric, anomalies: recent.slice(0, 5), worst_z: Math.round(worstZ * 100) / 100 },
    });
    if (!insErr) opened++;
  }

  infraLogger.info({ tenantId, metric, opened, anomalous: anomalousCtos.length }, 'D-04: scan de incidentes');
  return { opened, anomalousCtos };
}

// ── Transições ───────────────────────────────────────────────────────────────

async function loadIncident(tenantId: string, id: string, db: typeof supabase) {
  const { data, error } = await db
    .from('incidents').select('*')
    .eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (error) throw new Error(`D-04: ${error.message}`);
  if (!data) throw new Error('D-04: incidente não encontrado');
  return data;
}

export async function transitionIncident(
  tenantId: string,
  id: string,
  to: IncidentStatus,
  ports: IncidentPorts = defaultPorts,
): Promise<void> {
  const incident = await loadIncident(tenantId, id, ports.db);
  const from = incident.status as IncidentStatus;
  if (!canTransition(from, to)) {
    throw new Error(`D-04: transição inválida ${from} → ${to}`);
  }

  const patch: Record<string, unknown> = { status: to };
  const tsCol = STATUS_TIMESTAMP[to];
  if (tsCol) patch[tsCol] = new Date().toISOString();

  // Confirmar = medir o raio da explosão (quem pende daquela CTO)
  if (to === 'confirmada' && incident.cto_id) {
    const { data: affected } = await ports.db
      .from('customers').select('id')
      .eq('tenant_id', tenantId).eq('cto_id', incident.cto_id).eq('status', 'active');
    patch.affected_customers = affected?.length ?? 0;
  }

  const { error } = await ports.db
    .from('incidents').update(patch)
    .eq('tenant_id', tenantId).eq('id', id);
  if (error) throw new Error(`D-04: falha na transição: ${error.message}`);
}

/**
 * Comunicar: registra a notificação em massa (P1-02) para os afetados e move
 * o estado. A mensagem é a microcópia de crise do tenant (RN14) ou o padrão.
 */
export async function communicateIncident(
  tenantId: string,
  id: string,
  message: string | undefined,
  ports: IncidentPorts = defaultPorts,
): Promise<{ customerCount: number }> {
  const incident = await loadIncident(tenantId, id, ports.db);
  if (!canTransition(incident.status as IncidentStatus, 'comunicada')) {
    throw new Error(`D-04: transição inválida ${incident.status} → comunicada`);
  }

  const msg = message ??
    'Identificamos uma instabilidade na sua região e nossa equipe já foi acionada. ' +
    'Você não precisa nos chamar — avisaremos assim que estiver normalizado.';

  const { error: notifErr } = await ports.db.from('outage_notifications').insert({
    tenant_id: tenantId,
    cto_id: incident.cto_id,
    message: msg,
    customer_count: incident.affected_customers ?? 0,
  });
  if (notifErr) throw new Error(`D-04: falha ao registrar notificação: ${notifErr.message}`);

  await transitionIncident(tenantId, id, 'comunicada', ports);
  return { customerCount: incident.affected_customers ?? 0 };
}
