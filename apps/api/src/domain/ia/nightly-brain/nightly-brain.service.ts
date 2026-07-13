/**
 * E-01/E-02 — CÉREBRO NOTURNO: a Astrum que pensa enquanto o provedor dorme.
 *
 * Toda noite (ou sob demanda): junta os números do dia → gera hipóteses por
 * REGRAS determinísticas (o LLM é opcional e só REFINA o texto — nunca decide
 * sozinho) → registra o diário em ai_reflections → sugere ações dentro de
 * alçada (E-03 executa; aqui só recomenda).
 *
 * Flags: NIGHTLY_BRAIN_ENABLED (worker 03:00, default OFF) ·
 *        NIGHTLY_BRAIN_LLM (refino de texto via 4o-mini, default OFF).
 * Ports injetáveis (disciplina D6): 100% testável e rodável no tenant demo.
 */
import supabase from '../../../infrastructure/database/supabase.client';
import { iaLogger } from '../../../infrastructure/logging/logger';

export function isNightlyBrainEnabled(): boolean {
  return (process.env.NIGHTLY_BRAIN_ENABLED ?? '').trim().toLowerCase() === 'true';
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface DailyMetrics {
  date: string;
  ticketsTotal: number;
  ticketsResolvedByAi: number;
  aiResolutionRate: number;      // 0..1
  conversationsEscalated: number;
  conversationsTotal: number;
  escalationRate: number;        // 0..1
  aiCostUsd: number;
  aiCostPrev7dAvgUsd: number;
  avgCsat: number | null;        // 1..5
  invoicesOverdue: number;
  kbDraftCandidates: number;     // conversas resolvidas sem artigo (combustível D-05)
  networkAnomalies: { ctoId: string; metric: string }[];
}

export interface Hypothesis {
  code: string;
  severity: 'info' | 'atencao' | 'critico';
  text: string;
  evidence: Record<string, unknown>;
}

export interface SuggestedAction {
  type: 'kb_scan' | 'bandit_variant' | 'open_incident' | 'review_prompt' | 'none';
  detail: string;
}

export interface Reflection {
  tenantId: string;
  date: string;
  metrics: DailyMetrics;
  hypotheses: Hypothesis[];
  actions: SuggestedAction[];
  generatedBy: 'rules' | 'rules+llm';
}

export interface NightlyBrainPorts {
  db: typeof supabase;
  /** Refino opcional do texto das hipóteses (E-02). null = sem LLM. */
  refineLlm: ((hypotheses: Hypothesis[], metrics: DailyMetrics) => Promise<Hypothesis[]>) | null;
}

export const defaultPorts: NightlyBrainPorts = { db: supabase, refineLlm: null };

// ── 1. Coleta: os números do dia ─────────────────────────────────────────────

export async function gatherDailyMetrics(
  tenantId: string,
  date: string,
  db: typeof supabase = supabase,
): Promise<DailyMetrics> {
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;
  const prev7dStart = new Date(new Date(dayStart).getTime() - 7 * 86400000).toISOString();

  const [tickets, conversations, aiLogs, aiLogsPrev, overdue, kbCandidates] = await Promise.all([
    db.from('tickets').select('id, resolved_by_ai, status')
      .eq('tenant_id', tenantId).gte('created_at', dayStart).lte('created_at', dayEnd),
    db.from('conversations').select('id, status')
      .eq('tenant_id', tenantId).gte('created_at', dayStart).lte('created_at', dayEnd),
    db.from('ai_performance_logs').select('cost_usd, extra')
      .eq('tenant_id', tenantId).gte('created_at', dayStart).lte('created_at', dayEnd),
    db.from('ai_performance_logs').select('cost_usd')
      .eq('tenant_id', tenantId).gte('created_at', prev7dStart).lt('created_at', dayStart),
    db.from('invoices').select('id')
      .eq('tenant_id', tenantId).eq('status', 'overdue'),
    db.from('conversations').select('id')
      .eq('tenant_id', tenantId).eq('status', 'resolved'),
  ]);

  const tRows = tickets.data ?? [];
  const cRows = conversations.data ?? [];
  const logRows = aiLogs.data ?? [];
  const prevRows = aiLogsPrev.data ?? [];

  const resolvedByAi = tRows.filter((t: any) => t.resolved_by_ai).length;
  const escalated = cRows.filter((c: any) => c.status === 'escalated').length;
  const costToday = logRows.reduce((s: number, r: any) => s + Number(r.cost_usd ?? 0), 0);
  const costPrev = prevRows.reduce((s: number, r: any) => s + Number(r.cost_usd ?? 0), 0);
  const csats = logRows
    .map((r: any) => Number(r.extra?.csat_score))
    .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 5);

  return {
    date,
    ticketsTotal: tRows.length,
    ticketsResolvedByAi: resolvedByAi,
    aiResolutionRate: tRows.length ? resolvedByAi / tRows.length : 0,
    conversationsEscalated: escalated,
    conversationsTotal: cRows.length,
    escalationRate: cRows.length ? escalated / cRows.length : 0,
    aiCostUsd: Math.round(costToday * 10000) / 10000,
    aiCostPrev7dAvgUsd: Math.round((costPrev / 7) * 10000) / 10000,
    avgCsat: csats.length ? Math.round((csats.reduce((a: number, b: number) => a + b, 0) / csats.length) * 100) / 100 : null,
    invoicesOverdue: overdue.data?.length ?? 0,
    kbDraftCandidates: kbCandidates.data?.length ?? 0,
    networkAnomalies: [], // preenchido pelo runner (incident scan alimenta aqui)
  };
}

// ── 2. Hipóteses por REGRAS (o LLM nunca decide — só refina texto) ───────────

export function generateHypotheses(m: DailyMetrics): Hypothesis[] {
  const out: Hypothesis[] = [];

  if (m.conversationsTotal >= 5 && m.escalationRate > 0.25) {
    out.push({
      code: 'ESCALACAO_ALTA', severity: 'atencao',
      text: `${Math.round(m.escalationRate * 100)}% das conversas do dia escalaram para humano — acima do teto de 25%. Hipótese: falta de artigo na KB ou tool falhando. Ver os transcripts escalados.`,
      evidence: { escalated: m.conversationsEscalated, total: m.conversationsTotal },
    });
  }
  if (m.ticketsTotal >= 5 && m.aiResolutionRate < 0.5) {
    out.push({
      code: 'RESOLUCAO_IA_BAIXA', severity: 'atencao',
      text: `IA resolveu só ${Math.round(m.aiResolutionRate * 100)}% dos tickets do dia (meta ≥50%). Hipótese: novos tipos de problema sem cobertura. Rodar scan de KB.`,
      evidence: { resolvedByAi: m.ticketsResolvedByAi, total: m.ticketsTotal },
    });
  }
  if (m.aiCostPrev7dAvgUsd > 0.01 && m.aiCostUsd > m.aiCostPrev7dAvgUsd * 1.5) {
    out.push({
      code: 'CUSTO_SUBINDO', severity: 'critico',
      text: `Custo de IA do dia (US$ ${m.aiCostUsd.toFixed(2)}) está ${Math.round((m.aiCostUsd / m.aiCostPrev7dAvgUsd - 1) * 100)}% acima da média de 7d. Hipótese: loop de retry ou conversa presa. Ver cost drill-down.`,
      evidence: { today: m.aiCostUsd, prev7dAvg: m.aiCostPrev7dAvgUsd },
    });
  }
  if (m.avgCsat !== null && m.avgCsat < 3.5) {
    out.push({
      code: 'CSAT_BAIXO', severity: 'critico',
      text: `CSAT médio do dia foi ${m.avgCsat} (meta ≥4). Hipótese: tom ou precisão fora. Priorizar rotulagem das conversas de nota baixa.`,
      evidence: { avgCsat: m.avgCsat },
    });
  }
  if (m.kbDraftCandidates >= 10) {
    out.push({
      code: 'KB_COMBUSTIVEL', severity: 'info',
      text: `${m.kbDraftCandidates} conversas resolvidas prontas para virar artigo de KB (D-05). Conhecimento parado na mesa.`,
      evidence: { candidates: m.kbDraftCandidates },
    });
  }
  for (const a of m.networkAnomalies) {
    out.push({
      code: 'ANOMALIA_REDE', severity: 'critico',
      text: `Telemetria anômala na CTO ${a.ctoId} (${a.metric}). Hipótese: degradação física — cruzar com tickets da região e abrir incidente (D-04).`,
      evidence: a,
    });
  }
  if (out.length === 0) {
    out.push({
      code: 'DIA_SAUDAVEL', severity: 'info',
      text: 'Nenhum desvio relevante hoje. Métricas dentro das metas.',
      evidence: {},
    });
  }
  return out;
}

/** Ações dentro de alçada (RE2 do PLANO_E): aqui só SUGERE — E-03 executa. */
export function suggestActions(hypotheses: Hypothesis[]): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  for (const h of hypotheses) {
    if (h.code === 'KB_COMBUSTIVEL' || h.code === 'RESOLUCAO_IA_BAIXA') {
      actions.push({ type: 'kb_scan', detail: 'Rodar POST /api/v2/kb/drafts/scan e curar os rascunhos.' });
    }
    if (h.code === 'ANOMALIA_REDE') {
      actions.push({ type: 'open_incident', detail: `Abrir incidente D-04 para ${JSON.stringify(h.evidence)}.` });
    }
    if (h.code === 'CSAT_BAIXO' || h.code === 'ESCALACAO_ALTA') {
      actions.push({ type: 'review_prompt', detail: 'Revisar transcripts do dia na tela de replay antes de mexer em prompt.' });
    }
    if (h.code === 'CUSTO_SUBINDO') {
      actions.push({ type: 'bandit_variant', detail: 'Checar variantes ativas — pausar braço com custo desproporcional.' });
    }
  }
  const seen = new Set<string>();
  return actions.filter((a) => (seen.has(a.type) ? false : (seen.add(a.type), true)));
}

// ── 3. O ciclo completo de uma noite ─────────────────────────────────────────

export async function runNightlyReflection(
  tenantId: string,
  date: string,
  ports: NightlyBrainPorts = defaultPorts,
  anomalies: { ctoId: string; metric: string }[] = [],
): Promise<Reflection> {
  const metrics = await gatherDailyMetrics(tenantId, date, ports.db);
  metrics.networkAnomalies = anomalies;

  let hypotheses = generateHypotheses(metrics);
  let generatedBy: Reflection['generatedBy'] = 'rules';
  if (ports.refineLlm) {
    try {
      hypotheses = await ports.refineLlm(hypotheses, metrics);
      generatedBy = 'rules+llm';
    } catch (err) {
      iaLogger.warn({ err: (err as Error).message }, 'E-02: refino LLM falhou — mantendo hipóteses por regras');
    }
  }
  const actions = suggestActions(hypotheses);

  const { error } = await ports.db.from('ai_reflections').upsert({
    tenant_id: tenantId,
    reflection_date: date,
    metrics,
    hypotheses,
    actions,
    generated_by: generatedBy,
  }, { onConflict: 'tenant_id,reflection_date' });
  if (error) throw new Error(`E-01: falha ao gravar reflexão: ${error.message}`);

  iaLogger.info({ tenantId, date, hypotheses: hypotheses.length, actions: actions.length }, 'E-01: reflexão noturna gravada');
  return { tenantId, date, metrics, hypotheses, actions, generatedBy };
}
