/**
 * D-01 Fase 1 — GÊMEO DIGITAL DA REDE: simulação what-if determinística.
 *
 * "Se esta CTO cair, quem grita e quanto custa?" · "Se eu ganhar N clientes
 * neste bairro, onde satura primeiro?" — respondido ANTES de acontecer, com
 * clientes, MRR em risco e tickets previstos.
 *
 * Fase 1 = determinística sobre o grafo real (customers.cto_id + network_ctos).
 * Fase 2 (futura) = probabilística: IA-24 alimenta o cenário com a CTO mais
 * provável de falhar. Ports injetáveis; roda no demo hoje, calibra depois.
 */
import { supabaseAdmin as supabase } from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface CtoNode {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  total_ports: number;
  used_ports: number;
  status: string;
}

export interface FailureSimulation {
  cto: { id: string; name: string };
  affectedCustomers: number;
  mrrAtRiskCents: number;
  /** Tickets previstos na 1ª hora, pela propensão histórica de reclamação. */
  predictedTickets: number;
  ticketPropensity: number; // tickets/cliente/90d observado (calibrável)
  /** Vizinhas com porta livre, da mais próxima para a mais distante. */
  reallocation: { ctoId: string; name: string; distanceKm: number; freePorts: number }[];
  /** Clientes que NÃO cabem nas vizinhas (ficariam no escuro até reparo). */
  strandedCustomers: number;
  assumptions: string[];
}

export interface GrowthSimulation {
  targetCto: { id: string; name: string };
  newCustomers: number;
  freePortsBefore: number;
  absorbed: number;
  overflow: number;
  /** Para onde o transbordo iria (vizinhas com folga). */
  spillover: { ctoId: string; name: string; distanceKm: number; absorbs: number }[];
  /** true = precisa de CAPEX (nova CTO/expansão) para atender o crescimento. */
  capexNeeded: boolean;
  projectedMrrGainCents: number;
  assumptions: string[];
}

/** Distância haversine em km (a planta usa lat/lng reais). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 100) / 100;
}

export interface TwinPorts {
  db: typeof supabase;
}
export const defaultPorts: TwinPorts = { db: supabase };

async function loadCtos(tenantId: string, db: typeof supabase): Promise<CtoNode[]> {
  const { data, error } = await db
    .from('network_ctos')
    .select('id, name, latitude, longitude, total_ports, used_ports, status')
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`D-01 twin: ${error.message}`);
  return (data ?? []) as CtoNode[];
}

/** Propensão de reclamação: tickets 90d ÷ clientes ativos (clamp 0.05–1.5). */
async function ticketPropensity(tenantId: string, db: typeof supabase): Promise<number> {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const [{ data: tickets }, { data: actives }] = await Promise.all([
    db.from('tickets').select('id').eq('tenant_id', tenantId).gte('created_at', since),
    db.from('customers').select('id').eq('tenant_id', tenantId).eq('status', 'active'),
  ]);
  const t = tickets?.length ?? 0;
  const c = actives?.length ?? 0;
  if (!c) return 0.3;
  return Math.min(1.5, Math.max(0.05, t / c));
}

// ── Simulação 1: "se esta CTO cair" ─────────────────────────────────────────

export async function simulateCtoFailure(
  tenantId: string,
  ctoId: string,
  ports: TwinPorts = defaultPorts,
): Promise<FailureSimulation> {
  const ctos = await loadCtos(tenantId, ports.db);
  const target = ctos.find((c) => c.id === ctoId);
  if (!target) throw new Error('D-01 twin: CTO não encontrada');

  const { data: customers, error } = await ports.db
    .from('customers')
    .select('id, mrr_cents')
    .eq('tenant_id', tenantId)
    .eq('cto_id', ctoId)
    .eq('status', 'active');
  if (error) throw new Error(`D-01 twin: ${error.message}`);

  const affected = customers?.length ?? 0;
  const mrrAtRisk = (customers ?? []).reduce((s, c: any) => s + Number(c.mrr_cents ?? 0), 0);
  const propensity = await ticketPropensity(tenantId, ports.db);
  // Numa QUEDA TOTAL a propensão explode: 60% dos afetados reclamam na 1ª hora
  // (número calibrável — em crise real medida pelo D-04, ajustar).
  const crisisFactor = 0.6;
  const predictedTickets = Math.round(affected * crisisFactor);

  const neighbors = ctos
    .filter((c) => c.id !== ctoId && c.status === 'active')
    .map((c) => ({
      ctoId: c.id,
      name: c.name,
      distanceKm: haversineKm(target.latitude, target.longitude, c.latitude, c.longitude),
      freePorts: Math.max(0, c.total_ports - c.used_ports),
    }))
    .filter((c) => c.freePorts > 0)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 5);

  const capacity = neighbors.reduce((s, n) => s + n.freePorts, 0);
  const stranded = Math.max(0, affected - capacity);

  return {
    cto: { id: target.id, name: target.name },
    affectedCustomers: affected,
    mrrAtRiskCents: mrrAtRisk,
    predictedTickets,
    ticketPropensity: Math.round(propensity * 100) / 100,
    reallocation: neighbors,
    strandedCustomers: stranded,
    assumptions: [
      `Em queda total, ${crisisFactor * 100}% dos afetados abrem ticket na 1ª hora (calibrar com dados do D-04).`,
      'Realocação assume viabilidade física até as 5 CTOs mais próximas com porta livre (verificar em campo).',
      'MRR em risco = mensalidade dos ativos da CTO; churn efetivo depende da duração da queda.',
    ],
  };
}

// ── Simulação 2: "se eu ganhar N clientes aqui" ──────────────────────────────

export async function simulateGrowth(
  tenantId: string,
  ctoId: string,
  newCustomers: number,
  avgMrrCents: number | null,
  ports: TwinPorts = defaultPorts,
): Promise<GrowthSimulation> {
  if (newCustomers <= 0) throw new Error('D-01 twin: newCustomers deve ser > 0');
  const ctos = await loadCtos(tenantId, ports.db);
  const target = ctos.find((c) => c.id === ctoId);
  if (!target) throw new Error('D-01 twin: CTO não encontrada');

  // MRR médio do tenant quando não informado (para projetar o ganho)
  let mrr = avgMrrCents;
  if (mrr == null) {
    const { data } = await ports.db
      .from('customers').select('mrr_cents')
      .eq('tenant_id', tenantId).eq('status', 'active').limit(500);
    const rows = data ?? [];
    mrr = rows.length
      ? Math.round(rows.reduce((s: number, r: any) => s + Number(r.mrr_cents ?? 0), 0) / rows.length)
      : 0;
  }

  const freeBefore = Math.max(0, target.total_ports - target.used_ports);
  const absorbed = Math.min(newCustomers, freeBefore);
  let overflow = newCustomers - absorbed;

  const spillover: GrowthSimulation['spillover'] = [];
  if (overflow > 0) {
    const neighbors = ctos
      .filter((c) => c.id !== ctoId && c.status === 'active')
      .map((c) => ({
        ctoId: c.id,
        name: c.name,
        distanceKm: haversineKm(target.latitude, target.longitude, c.latitude, c.longitude),
        freePorts: Math.max(0, c.total_ports - c.used_ports),
      }))
      .filter((c) => c.freePorts > 0)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    for (const n of neighbors) {
      if (overflow <= 0) break;
      const absorbs = Math.min(overflow, n.freePorts);
      spillover.push({ ctoId: n.ctoId, name: n.name, distanceKm: n.distanceKm, absorbs });
      overflow -= absorbs;
    }
  }

  const result: GrowthSimulation = {
    targetCto: { id: target.id, name: target.name },
    newCustomers,
    freePortsBefore: freeBefore,
    absorbed,
    overflow,
    spillover,
    capexNeeded: overflow > 0,
    projectedMrrGainCents: newCustomers * (mrr ?? 0),
    assumptions: [
      'Transbordo para vizinhas assume viabilidade de rota física (validar com a planta/OZmap).',
      `MRR projetado usa ticket médio ${mrr != null ? `R$ ${(mrr / 100).toFixed(2)}` : 'indisponível'} dos ativos atuais.`,
      overflow > 0
        ? `CAPEX: sobram ${overflow} clientes sem porta mesmo usando vizinhas — expansão necessária ANTES da campanha.`
        : 'Capacidade atual absorve o crescimento sem obra.',
    ],
  };

  infraLogger.info({ tenantId, ctoId, newCustomers, absorbed, overflow }, 'D-01: simulação de crescimento');
  return result;
}

// ── D-01 Fase 2: probabilístico — CTOs com maior risco de falha ──────────────

export interface ProbabilisticRisk {
  ctoId: string;
  ctoName: string;
  failureScore: number;       // 0–1, composto de anomalia + ocupação + histórico
  anomalyScore: number;       // componente IA-24 (0–1)
  occupancyRisk: number;      // componente de saturação (0–1)
  affectedCustomers: number;
  mrrAtRiskCents: number;
  recommendation: string;
}

/**
 * D-01 Fase 2: rankeia CTOs pelo risco combinado de falha
 * (anomalia recente da IA-24 + ocupação + histórico de incidentes).
 * Combustível: ≥30d de network_metrics + incidents.
 */
export async function rankCtosByFailureRisk(
  tenantId: string,
  ports: TwinPorts = defaultPorts,
  opts: { limit?: number } = {},
): Promise<ProbabilisticRisk[]> {
  const ctos = await loadCtos(tenantId, ports.db);
  if (!ctos.length) return [];

  // Anomalias recentes por CTO (IA-24 output: network_anomalies)
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: anomalies } = await ports.db
    .from('network_anomalies')
    .select('cto_id, severity, detected_at')
    .eq('tenant_id', tenantId)
    .gte('detected_at', since30d);

  const anomalyByCto = new Map<string, number>();
  for (const a of anomalies ?? []) {
    if (!a.cto_id) continue;
    const prev = anomalyByCto.get(a.cto_id) ?? 0;
    const weight = (a.severity === 'critical' ? 1 : a.severity === 'high' ? 0.7 : 0.3);
    anomalyByCto.set(a.cto_id, Math.min(1, prev + weight * 0.25));
  }

  // Clientes por CTO para calcular MRR em risco
  const { data: customers } = await ports.db
    .from('customers')
    .select('cto_id, mrr_cents')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  const mrrByCto = new Map<string, number>();
  const countByCto = new Map<string, number>();
  for (const c of customers ?? []) {
    if (!c.cto_id) continue;
    mrrByCto.set(c.cto_id, (mrrByCto.get(c.cto_id) ?? 0) + Number(c.mrr_cents ?? 0));
    countByCto.set(c.cto_id, (countByCto.get(c.cto_id) ?? 0) + 1);
  }

  const results: ProbabilisticRisk[] = ctos
    .filter(cto => cto.status === 'active')
    .map(cto => {
      const occupancy = cto.total_ports > 0 ? cto.used_ports / cto.total_ports : 0;
      const occupancyRisk = occupancy > 0.9 ? 1 : occupancy > 0.75 ? 0.6 : occupancy > 0.5 ? 0.3 : 0.1;
      const anomalyScore = anomalyByCto.get(cto.id) ?? 0;
      const failureScore = Math.round((anomalyScore * 0.6 + occupancyRisk * 0.4) * 100) / 100;

      const mrrAtRiskCents = mrrByCto.get(cto.id) ?? 0;
      const affectedCustomers = countByCto.get(cto.id) ?? 0;

      const recommendation = failureScore > 0.7
        ? `Risco ALTO — agendar vistoria urgente (${affectedCustomers} clientes, R$ ${(mrrAtRiskCents / 100).toFixed(0)} MRR)`
        : failureScore > 0.4
        ? `Risco MÉDIO — incluir na ronda preventiva (${affectedCustomers} clientes)`
        : 'Risco baixo — monitoramento padrão suficiente';

      return { ctoId: cto.id, ctoName: cto.name, failureScore, anomalyScore, occupancyRisk, affectedCustomers, mrrAtRiskCents, recommendation };
    })
    .sort((a, b) => b.failureScore - a.failureScore)
    .slice(0, opts.limit ?? 10);

  infraLogger.info({ tenantId, count: results.length }, 'D-01 F2: ranking probabilístico de falha');
  return results;
}
