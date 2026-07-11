/**
 * P5-01 — Dashboard "Valor Gerado" (o que o dono do ISP vê).
 * P5-04 — Case engine: persiste e compartilha case auditado.
 *
 * Lógica pura com DB injetado — sem importações diretas do Supabase.
 * Fonte dos dados:
 *   - R$ recuperado: invoices pagas após ação CobrAI (cobrai_jobs × invoices)
 *   - Resoluções IA: conversations/tickets com resolved_by_ai = true
 *   - Custo IA: ai_performance_logs (tokens × preço unitário)
 *   - Tickets evitados: conversas resolvidas sem escalar para ticket
 */
import crypto from 'crypto';

export interface ValorGeradoDb {
  /** Soma de invoices pagas no período que tiveram ação CobrAI (centavos). */
  getRecoveredCents(tenantId: string, since: Date): Promise<number>;
  /** Conversas/tickets: total e quantas a IA resolveu sem humano. */
  getAiResolutions(tenantId: string, since: Date): Promise<{ aiResolved: number; total: number }>;
  /** Custo estimado de IA em USD (tokens_used × preço unitário). */
  getAiCostUsd(tenantId: string, since: Date): Promise<number>;
  /** Conversas resolvidas pela IA sem abrir ticket de escalação. */
  getTicketsAvoided(tenantId: string, since: Date): Promise<number>;
  /** Persiste o case e retorna o share_token único. */
  saveCase(tenantId: string, data: ValorCaseInput): Promise<string>;
  /** Recupera case pelo share_token (rota pública). */
  getCaseByToken(token: string): Promise<StoredCase | null>;
}

export interface ValorCaseInput {
  period: string;
  periodDays: number;
  recoveredCents: number;
  aiResolved: number;
  hoursSaved: number;
  ticketsAvoided: number;
  aiCostUsd: number;
  roiMultiple: number;
}

export interface StoredCase extends ValorCaseInput {
  id: string;
  tenantId: string;
  shareToken: string;
  createdAt: Date;
}

export interface ValorKpis {
  tenantId: string;
  period: string;
  periodDays: number;
  recoveredCents: number;
  recoveredBrl: number;
  aiResolved: number;
  totalAttendances: number;
  aiResolutionRatePct: number;
  hoursSaved: number;
  ticketsAvoided: number;
  aiCostUsd: number;
  roiMultiple: number;
  methodology: {
    recoveredNote: string;
    hoursSavedNote: string;
    roiNote: string;
  };
}

const MINUTES_PER_ATTENDANCE = 15; // tempo médio humano por atendimento (setor ISP)
const USD_TO_BRL = 5.2;            // taxa conservadora — atualizar conforme BCB

export async function computeValorGerado(
  db: ValorGeradoDb,
  tenantId: string,
  periodDays: number,
): Promise<ValorKpis> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const [recoveredCents, resolutions, aiCostUsd, ticketsAvoided] = await Promise.all([
    db.getRecoveredCents(tenantId, since),
    db.getAiResolutions(tenantId, since),
    db.getAiCostUsd(tenantId, since),
    db.getTicketsAvoided(tenantId, since),
  ]);

  const { aiResolved, total: totalAttendances } = resolutions;
  const aiResolutionRatePct =
    totalAttendances > 0
      ? Math.round((aiResolved / totalAttendances) * 1000) / 10
      : 0;

  const hoursSaved = Math.round((aiResolved * MINUTES_PER_ATTENDANCE / 60) * 10) / 10;
  const recoveredBrl = recoveredCents / 100;
  const aiCostBrl = aiCostUsd * USD_TO_BRL;
  const roiMultiple =
    aiCostBrl > 0
      ? Math.round((recoveredBrl / aiCostBrl) * 10) / 10
      : recoveredBrl > 0 ? 999 : 0;

  return {
    tenantId,
    period: `${periodDays}d`,
    periodDays,
    recoveredCents,
    recoveredBrl,
    aiResolved,
    totalAttendances,
    aiResolutionRatePct,
    hoursSaved,
    ticketsAvoided,
    aiCostUsd,
    roiMultiple,
    methodology: {
      recoveredNote:
        'R$ recuperado = soma de faturas pagas no período após ação da CobrAI. ' +
        'Auditável via tabela cobrai_jobs × invoices.',
      hoursSavedNote:
        `Horas economizadas = atendimentos resolvidos pela IA × ${MINUTES_PER_ATTENDANCE} min ` +
        '(média de tempo humano por atendimento de suporte ISP regional).',
      roiNote:
        `ROI = R$ recuperado ÷ custo de IA em BRL (USD × ${USD_TO_BRL}). ` +
        'Considera apenas cobrança — não inclui valor do atendimento e OS.',
    },
  };
}

export async function generateCase(
  db: ValorGeradoDb,
  tenantId: string,
  periodDays: number,
): Promise<{ kpis: ValorKpis; shareToken: string }> {
  const kpis = await computeValorGerado(db, tenantId, periodDays);
  const shareToken = await db.saveCase(tenantId, {
    period: kpis.period,
    periodDays: kpis.periodDays,
    recoveredCents: kpis.recoveredCents,
    aiResolved: kpis.aiResolved,
    hoursSaved: kpis.hoursSaved,
    ticketsAvoided: kpis.ticketsAvoided,
    aiCostUsd: kpis.aiCostUsd,
    roiMultiple: kpis.roiMultiple,
  });
  return { kpis, shareToken };
}

// ── Implementação Supabase (default) ──────────────────────────────────────────

import supabase from '../../infrastructure/database/supabase.client';

export const defaultValorGeradoDb: ValorGeradoDb = {
  async getRecoveredCents(tenantId, since) {
    // invoices pagas no período que tiveram pelo menos 1 cobrai_job associado
    const { data } = await (supabase as any)
      .from('invoices')
      .select('amount_cents, cobrai_jobs!inner(id)')
      .eq('tenant_id', tenantId)
      .eq('status', 'paid')
      .gte('paid_at', since.toISOString());
    return (data ?? []).reduce((sum: number, row: any) => sum + (row.amount_cents ?? 0), 0);
  },

  async getAiResolutions(tenantId, since) {
    const { data } = await (supabase as any)
      .from('conversations')
      .select('id, resolved_by_ai')
      .eq('tenant_id', tenantId)
      .in('status', ['resolved', 'closed'])
      .gte('created_at', since.toISOString());
    const rows = data ?? [];
    return {
      aiResolved: rows.filter((r: any) => r.resolved_by_ai).length,
      total: rows.length,
    };
  },

  async getAiCostUsd(tenantId, since) {
    // ai_performance_logs grava tokens_used por request
    const { data } = await (supabase as any)
      .from('ai_performance_logs')
      .select('tokens_used')
      .eq('tenant_id', tenantId)
      .gte('created_at', since.toISOString());
    const tokens = (data ?? []).reduce((s: number, r: any) => s + (r.tokens_used ?? 0), 0);
    // GPT-4o-mini = $0.15/1M tokens (input+output médio)
    return Math.round(tokens * 0.00000015 * 10000) / 10000;
  },

  async getTicketsAvoided(tenantId, since) {
    // conversas resolvidas pela IA sem ter escalado para ticket
    const { data } = await (supabase as any)
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('resolved_by_ai', true)
      .eq('escalated', false)
      .gte('created_at', since.toISOString());
    return (data ?? []).length;
  },

  async saveCase(tenantId, data) {
    const shareToken = crypto.randomBytes(16).toString('hex');
    await (supabase as any).from('valor_cases').insert({
      tenant_id: tenantId,
      period: data.period,
      period_days: data.periodDays,
      recovered_cents: data.recoveredCents,
      ai_resolved: data.aiResolved,
      hours_saved: data.hoursSaved,
      tickets_avoided: data.ticketsAvoided,
      ai_cost_usd: data.aiCostUsd,
      roi_multiple: data.roiMultiple,
      share_token: shareToken,
    });
    return shareToken;
  },

  async getCaseByToken(token) {
    const { data } = await (supabase as any)
      .from('valor_cases')
      .select('*')
      .eq('share_token', token)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      tenantId: data.tenant_id,
      period: data.period,
      periodDays: data.period_days,
      recoveredCents: data.recovered_cents,
      aiResolved: data.ai_resolved,
      hoursSaved: Number(data.hours_saved),
      ticketsAvoided: data.tickets_avoided,
      aiCostUsd: Number(data.ai_cost_usd),
      roiMultiple: Number(data.roi_multiple),
      shareToken: data.share_token,
      createdAt: new Date(data.created_at),
    };
  },
};
