/**
 * E-05 — RELATÓRIO DE AUTOEVOLUÇÃO: "o que a Astrum aprendeu este mês".
 *
 * Agrega o mês inteiro do organismo: reflexões noturnas, hipóteses por
 * severidade, ações executadas, artigos de KB gerados/publicados, incidentes
 * detectados/comunicados e a tendência de custo de IA (1ª vs última semana).
 * É o insumo do card no dashboard Valor Gerado (P5) — o dono lê em 30 segundos.
 */
import supabase from '../../../infrastructure/database/supabase.client';

export interface AutoevolucaoReport {
  month: string; // YYYY-MM
  nights: number;                      // reflexões gravadas
  hypotheses: { info: number; atencao: number; critico: number };
  actionsExecuted: number;
  actionsSkippedHumanGate: number;
  kbDraftsGenerated: number;
  kbDraftsPublished: number;
  incidentsDetected: number;
  incidentsCommunicated: number;
  aiCostFirstWeekUsd: number;
  aiCostLastWeekUsd: number;
  costTrendPct: number | null;         // negativo = ficou mais barata
  headline: string;                    // a frase para o card
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, 1));
  const end = new Date(Date.UTC(y!, m!, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function buildAutoevolucaoReport(
  tenantId: string,
  month: string,
  db: typeof supabase = supabase,
): Promise<AutoevolucaoReport> {
  const { start, end } = monthRange(month);

  const [reflections, drafts, incidents, logsFirst, logsLast] = await Promise.all([
    db.from('ai_reflections').select('hypotheses, actions')
      .eq('tenant_id', tenantId).gte('reflection_date', start.slice(0, 10)).lt('reflection_date', end.slice(0, 10)),
    db.from('kb_drafts').select('status, created_at')
      .eq('tenant_id', tenantId).gte('created_at', start).lt('created_at', end),
    db.from('incidents').select('status, detected_at')
      .eq('tenant_id', tenantId).gte('detected_at', start).lt('detected_at', end),
    db.from('ai_performance_logs').select('cost_usd')
      .eq('tenant_id', tenantId).gte('created_at', start)
      .lt('created_at', new Date(new Date(start).getTime() + 7 * 86400000).toISOString()),
    db.from('ai_performance_logs').select('cost_usd')
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(new Date(end).getTime() - 7 * 86400000).toISOString())
      .lt('created_at', end),
  ]);

  const refl = reflections.data ?? [];
  const hyp = { info: 0, atencao: 0, critico: 0 };
  let executed = 0;
  let skipped = 0;
  for (const r of refl) {
    for (const h of (r.hypotheses as any[]) ?? []) {
      if (h.severity in hyp) hyp[h.severity as keyof typeof hyp]++;
    }
    for (const a of (r.actions as any[]) ?? []) {
      if (a.executed === true) executed++;
      else if (a.executed === false) skipped++;
    }
  }

  const draftRows = drafts.data ?? [];
  const incRows = incidents.data ?? [];
  const sum = (rows: any[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const first = Math.round(sum(logsFirst.data) * 100) / 100;
  const last = Math.round(sum(logsLast.data) * 100) / 100;
  const trend = first > 0 ? Math.round(((last - first) / first) * 100) : null;

  const published = draftRows.filter((d: any) => d.status === 'published').length;
  const communicated = incRows.filter((i: any) => i.status === 'comunicada' || i.status === 'normalizada').length;

  const headline =
    `Este mês a Astrum pensou ${refl.length} noites, escreveu ${draftRows.length} rascunhos de artigo ` +
    `(${published} publicados), detectou ${incRows.length} incidente(s) de rede` +
    (trend !== null ? ` e o custo de IA ${trend <= 0 ? 'caiu' : 'subiu'} ${Math.abs(trend)}%.` : '.');

  return {
    month,
    nights: refl.length,
    hypotheses: hyp,
    actionsExecuted: executed,
    actionsSkippedHumanGate: skipped,
    kbDraftsGenerated: draftRows.length,
    kbDraftsPublished: published,
    incidentsDetected: incRows.length,
    incidentsCommunicated: communicated,
    aiCostFirstWeekUsd: first,
    aiCostLastWeekUsd: last,
    costTrendPct: trend,
    headline,
  };
}
