/**
 * Métrica de equivalência do replay (v2 vs. legado) — usada por `replay.service.ts`
 * para o gate de cutover histórico (S74). O roteamento real-vs-shadow que vivia
 * aqui (`decideSend`) foi removido em 2026-08-23: não há mais engine legada para
 * comparar em produção (Fase 4 apagou o Express por completo), e o freio de
 * emergência de verdade é `emergency-stop.service.ts` (Supabase, checado em toda
 * mensagem). Ver `astrum-rollback-atendimento-quebrado` na memória do Claude Code.
 */

/**
 * Métrica do relatório de shadow: taxa de equivalência entre respostas.
 * `judge` avalia se duas respostas são equivalentes (LLM-as-judge injetável).
 */
export async function computeEquivalenceRate(
  pairs: { v2: string; legacy: string }[],
  judge: (v2: string, legacy: string) => Promise<boolean>,
): Promise<{ total: number; equivalent: number; rate: number }> {
  let equivalent = 0;
  for (const p of pairs) {
    if (await judge(p.v2, p.legacy)) equivalent++;
  }
  const total = pairs.length;
  return { total, equivalent, rate: total === 0 ? 0 : equivalent / total };
}
