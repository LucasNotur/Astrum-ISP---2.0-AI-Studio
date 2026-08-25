/**
 * Engine Flags — flags simples de feature por domínio (process.env only).
 *
 * O par que existia aqui para CobrAI (`getCobraiEngine`/`isCobraiEngineActive`/
 * `shouldBootWorker`/`COBRAI_ENGINE`) foi removido em 2026-08-25 (Option A, mesma
 * decisão já aplicada ao atendimento em 2026-08-23 — ver `ATENDIMENTO_ENGINE` no
 * histórico do CLAUDE.md): o worker legado (`src/workers/cobraiWorker.ts`) só era
 * bootado pelo Express, apagado por completo na Fase 4 (2026-08-17/18) — a flag
 * não revertia mais nada, apenas desligava a cobrança inteira quando setada para
 * 'legacy'. v2 (`packages/queue/src/workers/cobrai.worker.ts`) é a única engine e
 * sobe incondicionalmente. O freio de emergência de verdade é o kill switch no
 * Supabase (ver `domain/cobranca/cobrai-emergency-stop.routes.ts`), não uma env.
 *
 * Sem dependências externas de propósito — lê apenas process.env, para poder ser
 * importado tanto pelo backend novo (apps/api) quanto pelo legado (/src) no load.
 */

/**
 * Multi-agente por domínio (IA-10).
 * Default: false — só ativa quando ATENDIMENTO_ENGINE=v2 estiver estável.
 */
export function isMultiAgentEnabled(): boolean {
  return (process.env.MULTI_AGENT_ENABLED ?? '').trim().toLowerCase() === 'true';
}
