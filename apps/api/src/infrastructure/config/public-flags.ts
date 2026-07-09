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
  // IA-38 — Churn. Reusa a env EXISTENTE do churn worker (RN9):
  //         `CHURN_ENGINE=on|off` (default off) em packages/queue/src/workers/churn.worker.ts.
  //         Quando off, a worker nem roda e a tela de IA-38 fica vazia.
  churn: 'CHURN_ENGINE',
  // IA-32 — OpenTelemetry (spans por nó do grafo).
  otel: 'OTEL_ENABLED',
  // IA-23 — LTV heurístico (coluna na tela de churn).
  ltv: 'LTV_ENABLED',
  // IA-31 — Ranking Elo de configurações.
  elo: 'MODEL_ELO_ENABLED',
  // IA-29 — Active learning (rotulagem de exemplos).
  activelearn: 'ACTIVE_LEARNING_ENABLED',
  // IA-15 — OCR multi-layout + fila de revisão.
  reviewqueue: 'OCR_MULTILAYOUT_ENABLED',
  // IA-17 — MCP server (tools read-only via API key).
  mcp: 'MCP_SERVER_ENABLED',
  // IA-22 — Web browsing (allowlist + citação).
  browse: 'BROWSING_ENABLED',
  // IA-39 — Constitutional loop (princípios editáveis).
  constitution: 'CONSTITUTIONAL_LOOP_ENABLED',
  // IA-28 — Perfil de comunicação (estilo inferido por heurística).
  commprofile: 'COMM_PROFILE_ENABLED',
  // IA-36 — Edge inference shadow mode (Cloudflare Workers AI).
  edgeinfer: 'EDGE_INFERENCE_MODE',
  // IA-35 — Latency budget (orçamento de latência por nó).
  latencybudget: 'LATENCY_BUDGET_ENABLED',
  // IA-24 — Network anomaly detection (EWMA + z-score).
  netanomaly: 'NETWORK_ANOMALY_ENABLED',
  // IA-25 — Demand forecast (seasonal moving average).
  forecast: 'DEMAND_FORECAST_ENABLED',
  // IA-13 — Voice QA (scorecard de chamadas de voz).
  voiceqa: 'VOICE_QA_ENABLED',
  // IA-40 — PII masking em transcrições de voz.
  voicepii: 'VOICE_PII_MASK_ENABLED',
  // IA-12 — Voice biometrics (consentimento + verificação).
  voicebio: 'VOICE_BIOMETRICS_ENABLED',
};

export function getPublicFlags(): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(PUBLIC_FLAGS).map(([key, env]) => {
      if (env === undefined) {
        return [key, true];
      }
      const val = (process.env[env] ?? '').trim().toLowerCase();
      return [key, val === 'true' || val === 'on'];
    }),
  );
}
