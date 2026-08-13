/**
 * Stats "ao vivo" do monitor de qualidade (QualityMonitorPage, 5 cards do topo).
 * Funções PURAS; a rota faz os SELECTs e injeta os agregados.
 *
 * Fonte real (verificada via MCP): NÃO existe tabela de CSAT/escalação/sentimento.
 * `tickets` não tem csat nem timestamp de resolução. Então cada card usa o melhor
 * sinal disponível e o que não tem fonte fica explícito (0 / "N/A"), sem inventar:
 *
 *   - open_tickets          → contagem viva de tickets `status='open'`.
 *   - resolved_last_24h     → card "% s/ Escalation (24h)": dos tickets tocados
 *                             nas últimas 24h, % que NÃO estão em `status='escalated'`
 *                             (há status de escalação explícito no modelo).
 *   - avg_response_time_ms  → `daily_metrics.tmr_total_ms` do dia mais recente
 *                             (agregado do fcr.worker; não é segundo-a-segundo).
 *   - avg_csat_week         → 0 — SEM fonte de CSAT no modelo de dados hoje.
 *   - top_escalating_agent  → agente (assigned_to) com mais tickets `escalated` nas
 *                             24h, nome resolvido em team_members; senão "N/A".
 */

export interface QualityLiveStats {
  open_tickets: number;
  resolved_last_24h: number;
  escalation_rate: number;
  avg_response_time_ms: number;
  avg_csat_week: number;
  top_escalating_agent: string;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function computeQualityLiveStats(input: {
  openTickets: number;
  total24h: number;
  escalated24h: number;
  avgResponseMs: number | null;
  avgCsatWeek: number | null;
  topEscalatingAgent: string | null;
}): QualityLiveStats {
  const hasActivity = input.total24h > 0;
  const escalationPct = hasActivity ? (input.escalated24h / input.total24h) * 100 : 0;
  const pctNoEscalation = hasActivity ? 100 - escalationPct : 0;

  return {
    open_tickets: Math.max(0, input.openTickets | 0),
    resolved_last_24h: round1(pctNoEscalation),
    // Sem atividade nas 24h → 0 (não há base pra falar em taxa de escalação).
    escalation_rate: hasActivity ? round1(escalationPct) : 0,
    avg_response_time_ms: input.avgResponseMs && input.avgResponseMs > 0 ? Math.round(input.avgResponseMs) : 0,
    avg_csat_week: input.avgCsatWeek && input.avgCsatWeek > 0 ? input.avgCsatWeek : 0,
    top_escalating_agent: input.topEscalatingAgent?.trim() || 'N/A',
  };
}

/**
 * Dado um array de `assigned_to` (pode ter nulls), devolve o id mais frequente
 * (empate → primeiro a atingir a contagem máxima). null se não houver nenhum.
 */
export function pickTopAgentId(assignedTo: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  let top: string | null = null;
  let topN = 0;
  for (const id of assignedTo) {
    if (!id) continue;
    const n = (counts.get(id) ?? 0) + 1;
    counts.set(id, n);
    if (n > topN) { topN = n; top = id; }
  }
  return top;
}
