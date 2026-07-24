/**
 * Dossiê #83 — NPS/CSAT Reporting avançado.
 * Calcula Net Promoter Score e Customer Satisfaction Score
 * a partir de respostas coletadas por conversa/ticket.
 */

export interface SurveyResponse {
  customerId: string;
  score: number;
  type: 'nps' | 'csat';
  createdAt: string;
  channel?: string;
  operatorId?: string;
}

export interface NpsResult {
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  score: number;
}

export interface CsatResult {
  satisfied: number;
  total: number;
  score: number;
}

export interface SatisfactionReport {
  tenantId: string;
  period: { from: string; to: string };
  nps: NpsResult;
  csat: CsatResult;
  byChannel: Record<string, { nps: number; csat: number; count: number }>;
  byOperator: Record<string, { nps: number; csat: number; count: number }>;
  trend: Array<{ month: string; nps: number; csat: number }>;
}

export function calculateNps(responses: SurveyResponse[]): NpsResult {
  const npsResponses = responses.filter((r) => r.type === 'nps');
  if (npsResponses.length === 0) return { promoters: 0, passives: 0, detractors: 0, total: 0, score: 0 };

  const promoters = npsResponses.filter((r) => r.score >= 9).length;
  const detractors = npsResponses.filter((r) => r.score <= 6).length;
  const passives = npsResponses.length - promoters - detractors;
  const score = Math.round(((promoters - detractors) / npsResponses.length) * 100);

  return { promoters, passives, detractors, total: npsResponses.length, score };
}

export function calculateCsat(responses: SurveyResponse[]): CsatResult {
  const csatResponses = responses.filter((r) => r.type === 'csat');
  if (csatResponses.length === 0) return { satisfied: 0, total: 0, score: 0 };

  const satisfied = csatResponses.filter((r) => r.score >= 4).length;
  const score = Math.round((satisfied / csatResponses.length) * 100);

  return { satisfied, total: csatResponses.length, score };
}

function groupBy<T>(items: T[], key: (item: T) => string | undefined): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item) ?? 'unknown';
    (groups[k] ??= []).push(item);
  }
  return groups;
}

export interface NpsCsatPorts {
  getResponses: (tenantId: string, from: string, to: string) => Promise<SurveyResponse[]>;
}

// ── D-05 CSAT real: score por conversa ─────────────────────────────────────

export interface CsatLookupPorts {
  db: { from: (table: string) => any };
}

/**
 * Busca a nota CSAT (1..5) mais recente de uma conversa.
 * Retorna null se não houver resposta CSAT para aquela conversa.
 */
export async function getConversationCsatScore(
  tenantId: string,
  conversationId: string,
  ports: CsatLookupPorts,
): Promise<number | null> {
  const { data } = await ports.db
    .from('survey_responses')
    .select('score')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .eq('type', 'csat')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.score ?? null;
}

/**
 * Busca notas CSAT em lote para múltiplas conversas.
 * Retorna Map<conversationId, score>.
 */
export async function batchConversationCsatScores(
  tenantId: string,
  conversationIds: string[],
  ports: CsatLookupPorts,
): Promise<Map<string, number>> {
  if (!conversationIds.length) return new Map();
  const { data } = await ports.db
    .from('survey_responses')
    .select('conversation_id, score')
    .eq('tenant_id', tenantId)
    .in('conversation_id', conversationIds)
    .eq('type', 'csat')
    .order('created_at', { ascending: false });

  const scores = new Map<string, number>();
  for (const row of data ?? []) {
    if (!scores.has(row.conversation_id)) {
      scores.set(row.conversation_id, row.score);
    }
  }
  return scores;
}

export async function buildSatisfactionReport(
  tenantId: string,
  from: string,
  to: string,
  ports: NpsCsatPorts,
): Promise<SatisfactionReport> {
  const responses = await ports.getResponses(tenantId, from, to);

  const byChannel: Record<string, { nps: number; csat: number; count: number }> = {};
  for (const [ch, items] of Object.entries(groupBy(responses, (r) => r.channel))) {
    byChannel[ch] = {
      nps: calculateNps(items).score,
      csat: calculateCsat(items).score,
      count: items.length,
    };
  }

  const byOperator: Record<string, { nps: number; csat: number; count: number }> = {};
  for (const [op, items] of Object.entries(groupBy(responses, (r) => r.operatorId))) {
    byOperator[op] = {
      nps: calculateNps(items).score,
      csat: calculateCsat(items).score,
      count: items.length,
    };
  }

  const byMonth = groupBy(responses, (r) => r.createdAt.slice(0, 7));
  const trend = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, items]) => ({
      month,
      nps: calculateNps(items).score,
      csat: calculateCsat(items).score,
    }));

  return {
    tenantId,
    period: { from, to },
    nps: calculateNps(responses),
    csat: calculateCsat(responses),
    byChannel,
    byOperator,
    trend,
  };
}
