import supabase from '../../infrastructure/database/supabase.client';
import { infraLogger } from '../../infrastructure/logging/logger';

/**
 * IA-16 — GraphRAG leve (raciocínio relacional sobre a rede física).
 *
 * 3 consultas SQL nomeadas. Sem banco de grafo novo. O grafo é a junção
 * `customers.cto_id ↔ network_ctos.id` + tickets por cliente.
 *
 * Deps injetáveis (parâmetro `db`) → testável sem Supabase real.
 */

export interface NetworkGraphPort {
  from: (table: string) => {
    select: (cols?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) => any;
  };
}

export interface ImpactoCtoResult {
  cto: { id: string; name: string };
  customers_total: number;
  customers_with_open_ticket: number;
  mrr_at_risk_cents: number;
  customers: Array<{ id: string; name: string; plan: string | null; status: string }>;
}

export interface ReincidenciaRow {
  cto_id: string;
  cto_name: string;
  tickets: number;
  risk: 'baixo' | 'medio' | 'alto' | 'critico';
}

export interface CapacidadeRow {
  cto_id: string;
  cto_name: string;
  used_ports: number;
  total_ports: number;
  occupancy: number;
  risk: 'medio' | 'alto' | 'critico';
}

const RISK_BY_QUARTILE = (n: number, max: number): ReincidenciaRow['risk'] => {
  if (max === 0) return 'baixo';
  const ratio = n / max;
  if (ratio >= 0.75) return 'critico';
  if (ratio >= 0.5) return 'alto';
  if (ratio >= 0.25) return 'medio';
  return 'baixo';
};

const RISK_BY_OCCUPANCY = (occ: number): CapacidadeRow['risk'] => {
  if (occ >= 0.95) return 'critico';
  if (occ >= 0.9) return 'alto';
  return 'medio';
};

/**
 * Impacto de uma falha na CTO: clientes afetados, nº com ticket aberto, MRR em risco.
 */
export async function impactoCto(
  db: NetworkGraphPort,
  tenantId: string,
  ctoId: string,
): Promise<ImpactoCtoResult | { error: string }> {
  // 1. dados da CTO
  const { data: cto, error: ctoErr } = await db.from('network_ctos')
    .select('id, name')
    .eq('id', ctoId)
    .eq('tenant_id', tenantId)
    .single();
  if (ctoErr || !cto) {
    infraLogger.warn({ ctoId, tenantId, err: ctoErr?.message }, 'graph: CTO não encontrada');
    return { error: 'CTO não encontrada' };
  }

  // 2. clientes na CTO + status
  const { data: customers, error: custErr } = await db.from('customers')
    .select('id, name, plan_id, status, mrr_cents')
    .eq('cto_id', ctoId)
    .eq('tenant_id', tenantId);
  if (custErr) {
    infraLogger.warn({ err: custErr.message, ctoId, tenantId }, 'graph: erro ao listar clientes');
    return { error: 'Erro ao listar clientes' };
  }
  const list = customers ?? [];
  const customersTotal = list.length;

  // 3. clientes com ticket aberto
  const customerIds = list.map((c: any) => c.id);
  let openCount = 0;
  if (customerIds.length > 0) {
    const { count, error: tkErr } = await db.from('tickets')
      .select('id', { count: 'exact', head: true })
      .in('customer_id', customerIds)
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'in_progress', 'escalated']);
    if (tkErr) {
      infraLogger.warn({ err: tkErr.message, ctoId }, 'graph: erro ao contar tickets abertos');
    } else {
      openCount = count ?? 0;
    }
  }

  // 4. MRR em risco = soma de mrr_cents de TODOS os clientes da CTO.
  // (B4 do plano: "MRR somado em centavos")
  const mrrAtRiskCents = list.reduce(
    (acc: number, c: any) => acc + (typeof c.mrr_cents === 'number' ? c.mrr_cents : 0),
    0,
  );

  return {
    cto: { id: cto.id, name: cto.name },
    customers_total: customersTotal,
    customers_with_open_ticket: openCount,
    mrr_at_risk_cents: mrrAtRiskCents,
    customers: list.map((c: any) => ({
      id: c.id,
      name: c.name,
      plan: c.plan_id ?? null,
      status: c.status ?? 'active',
    })),
  };
}

/**
 * Reincidência: nº de tickets por CTO na janela `days` (default 30). Top 10 ordenado desc.
 * Faixa de risco por quartil.
 */
export async function reincidencia(
  db: NetworkGraphPort,
  tenantId: string,
  days: number,
): Promise<ReincidenciaRow[]> {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // 1. pegar tickets na janela com cto_id do cliente
  const { data: tickets, error: tkErr } = await db.from('tickets')
    .select('customer_id, customers!inner(cto_id, network_ctos!inner(id, name))')
    .eq('tenant_id', tenantId)
    .gte('created_at', sinceIso);
  if (tkErr) {
    infraLogger.warn({ err: tkErr.message, tenantId }, 'graph: erro ao listar tickets');
    return [];
  }

  // 2. agregar por CTO
  const counts: Record<string, { name: string; n: number }> = {};
  for (const t of tickets ?? []) {
    const cto = (t as any).customers?.network_ctos;
    if (!cto) continue;
    const id = cto.id;
    if (!counts[id]) counts[id] = { name: cto.name, n: 0 };
    counts[id].n += 1;
  }
  const rows: ReincidenciaRow[] = Object.entries(counts).map(([cto_id, v]) => ({
    cto_id,
    cto_name: v.name,
    tickets: v.n,
    risk: 'baixo',
  }));
  rows.sort((a, b) => b.tickets - a.tickets);
  const top = rows.slice(0, 10);
  const max = top[0]?.tickets ?? 0;
  for (const r of top) r.risk = RISK_BY_QUARTILE(r.tickets, max);
  return top;
}

/**
 * Capacidade: CTOs com used_ports/total_ports > 0.85.
 */
export async function capacidade(
  db: NetworkGraphPort,
  tenantId: string,
): Promise<CapacidadeRow[]> {
  const { data: ctos, error: ctoErr } = await db.from('network_ctos')
    .select('id, name, total_ports, used_ports')
    .eq('tenant_id', tenantId);
  if (ctoErr) {
    infraLogger.warn({ err: ctoErr.message, tenantId }, 'graph: erro ao listar CTOs');
    return [];
  }
  const rows: CapacidadeRow[] = [];
  for (const c of ctos ?? []) {
    const total = Number(c.total_ports) || 0;
    const used = Number(c.used_ports) || 0;
    if (total === 0) continue;
    const occ = used / total;
    if (occ <= 0.85) continue;
    rows.push({
      cto_id: c.id,
      cto_name: c.name,
      used_ports: used,
      total_ports: total,
      occupancy: occ,
      risk: RISK_BY_OCCUPANCY(occ),
    });
  }
  rows.sort((a, b) => b.occupancy - a.occupancy);
  return rows;
}

/**
 * Adapter padrão: usa o cliente Supabase real (produção).
 */
export const defaultDb: NetworkGraphPort = supabase as any;
