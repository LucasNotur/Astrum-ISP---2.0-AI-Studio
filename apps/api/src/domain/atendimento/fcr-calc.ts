/**
 * FCR Calc — taxa de resolução no primeiro contato + agregados. Port do fcrWorker (S79).
 * Função pura; o worker busca os tickets do dia e grava em ai_performance_logs.
 */

export interface TicketForFcr {
  status: string;              // resolved | closed | escalated | open ...
  escalated?: boolean;
  resolvedByAi?: boolean;
  reopened?: boolean;
}

export interface FcrResult {
  total: number;
  resolved: number;
  escalated: number;
  aiResolved: number;
  humanResolved: number;
  fcrRate: number;             // resolvidos sem escalar nem reabrir / total
  aiResolutionRate: number;    // aiResolved / resolved
}

export function computeFcr(tickets: TicketForFcr[]): FcrResult {
  const total = tickets.length;
  let resolved = 0, escalated = 0, aiResolved = 0, humanResolved = 0, firstContact = 0;

  for (const t of tickets) {
    const isResolved = t.status === 'resolved' || t.status === 'closed';
    if (t.escalated || t.status === 'escalated') escalated++;
    if (isResolved) {
      resolved++;
      if (t.resolvedByAi) aiResolved++; else humanResolved++;
      // FCR = resolvido sem ter escalado e sem reabrir.
      if (!t.escalated && !t.reopened) firstContact++;
    }
  }

  return {
    total,
    resolved,
    escalated,
    aiResolved,
    humanResolved,
    fcrRate: total === 0 ? 0 : firstContact / total,
    aiResolutionRate: resolved === 0 ? 0 : aiResolved / resolved,
  };
}
