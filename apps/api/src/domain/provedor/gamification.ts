/**
 * Gamification — ranking de operadores. Port do gamificationWorker (S80). Pura.
 */

export interface OperatorTicketAgg {
  operatorId: string;
  resolved: number;
  escalated: number;
  avgCsat: number;        // 0–5
  avgResponseMin: number; // menor = melhor
}

export interface RankedOperator extends OperatorTicketAgg {
  score: number;
  rank: number;
}

/**
 * Score: resolvidos valem, CSAT bonifica, escalonamentos e lentidão penalizam.
 * Determinístico e transparente (não é caixa-preta).
 */
export function scoreOperator(a: OperatorTicketAgg): number {
  const resolveScore = a.resolved * 10;
  const csatBonus = a.avgCsat * 5;
  const escalationPenalty = a.escalated * 4;
  const speedPenalty = Math.min(a.avgResponseMin / 10, 20); // teto de penalidade
  return Math.round((resolveScore + csatBonus - escalationPenalty - speedPenalty) * 100) / 100;
}

/** Ordena operadores por score desc e atribui rank (1 = melhor). Empate: mais resolvidos. */
export function computeOperatorRanking(aggs: OperatorTicketAgg[]): RankedOperator[] {
  return aggs
    .map((a) => ({ ...a, score: scoreOperator(a), rank: 0 }))
    .sort((x, y) => y.score - x.score || y.resolved - x.resolved)
    .map((o, i) => ({ ...o, rank: i + 1 }));
}
