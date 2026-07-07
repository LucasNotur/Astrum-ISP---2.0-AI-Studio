/**
 * Flags públicas expostas ao frontend via GET /api/v2/flags/public.
 *
 * Regras:
 * - Whitelist explícita: NUNCA iterar process.env.
 * - Cada sessão IA-XX adiciona uma entrada: '<chave client>': '<ENV_SERVER>'.
 * - Valores são normalizados para boolean (apenas 'true' ativa).
 * - `undefined` no lugar do env = flag client-only, sempre ON. Usado quando
 *   a feature é inócua para gravar no banco (sem precisar de opt-in runtime).
 *   Exemplo IA-34: costdrill — só destrava abas de UI; a gravação no banco
 *   já é feita sempre.
 */

const PUBLIC_FLAGS: Record<string, string | undefined> = {
  hub: 'INTELLIGENCE_HUB_ENABLED',
  toolreg: 'TOOL_REGISTRY_ENABLED',
  safety: 'SAFETY_CLASSIFIER_ENABLED',
  graphrag: 'GRAPHRAG_ENABLED',
  translate: 'LIVE_TRANSLATION_ENABLED',
  compression: 'PROMPT_COMPRESSION_ENABLED',
  features: 'FEATURE_STORE_ENABLED',
  bandit: 'BANDIT_ENABLED',
  drift: 'DRIFT_DETECTION_ENABLED',
  costdrill: undefined, // IA-34: client-only, sem env server (gravação inócua).
  sandbox: 'AGENT_SANDBOX_ENABLED',
  synthdata: 'SYNTH_DATA_ENABLED',
  // IA-43 — flag de failover multi-provider (off por padrão).
  failover: 'PROVIDER_FAILOVER_ENABLED',
  replay: 'REPLAY_ENGINE_ENABLED',
};

export function getPublicFlags(): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(PUBLIC_FLAGS).map(([key, env]) => {
      if (env === undefined) {
        return [key, true];
      }
      return [key, (process.env[env] ?? '').trim().toLowerCase() === 'true'];
    }),
  );
}
