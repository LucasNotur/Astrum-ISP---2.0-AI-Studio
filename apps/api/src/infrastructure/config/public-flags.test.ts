import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPublicFlags } from './public-flags';

/**
 * Baseline: todas as flags controladas por env desligadas.
 * `costdrill` é client-only (env undefined) → sempre true.
 * Cada sessão IA-XX adiciona a sua chave aqui.
 */
const allOff: Record<string, boolean> = {
  hub: false,
  toolreg: false,
  safety: false,
  graphrag: false,
  translate: false,
  compression: false,
  features: false,
  bandit: false,
  drift: false,
  costdrill: true, // client-only — sempre true
  sandbox: false,
  synthdata: false,
  failover: false,
  replay: false,
  // IA-38
  churn: false,
  // IA-32
  otel: false,
  // IA-23
  ltv: false,
  // IA-31
  elo: false,
  // IA-29
  activelearn: false,
  // IA-15
  reviewqueue: false,
  // IA-17
  mcp: false,
  // IA-22
  browse: false,
  // IA-39
  constitution: false,
  // IA-28
  commprofile: false,
  // IA-36
  edgeinfer: false,
  // IA-35
  latencybudget: false,
  // IA-24
  netanomaly: false,
  // IA-25
  forecast: false,
  // IA-13
  voiceqa: false,
  // IA-40
  voicepii: false,
  // IA-12
  voicebio: false,
};

const FLAG_ENVS = [
  'INTELLIGENCE_HUB_ENABLED',
  'TOOL_REGISTRY_ENABLED',
  'SAFETY_CLASSIFIER_ENABLED',
  'GRAPHRAG_ENABLED',
  'LIVE_TRANSLATION_ENABLED',
  'PROMPT_COMPRESSION_ENABLED',
  'FEATURE_STORE_ENABLED',
  'BANDIT_ENABLED',
  'DRIFT_DETECTION_ENABLED',
  'AGENT_SANDBOX_ENABLED',
  'SYNTH_DATA_ENABLED',
  'PROVIDER_FAILOVER_ENABLED',
  'REPLAY_ENGINE_ENABLED',
  'CHURN_ENGINE',
  'OTEL_ENABLED',
  'LTV_ENABLED',
  'MODEL_ELO_ENABLED',
  'ACTIVE_LEARNING_ENABLED',
  'OCR_MULTILAYOUT_ENABLED',
  'MCP_SERVER_ENABLED',
  'BROWSING_ENABLED',
  'CONSTITUTIONAL_LOOP_ENABLED',
  'COMM_PROFILE_ENABLED',
  'EDGE_INFERENCE_MODE',
  'LATENCY_BUDGET_ENABLED',
  'NETWORK_ANOMALY_ENABLED',
  'DEMAND_FORECAST_ENABLED',
  'VOICE_QA_ENABLED',
  'VOICE_PII_MASK_ENABLED',
  'VOICE_BIOMETRICS_ENABLED',
];

describe('public-flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const env of FLAG_ENVS) delete process.env[env];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('retorna false quando a env está ausente (e true para client-only)', () => {
    expect(getPublicFlags()).toEqual(allOff);
  });

  it('retorna true para "true"', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ ...allOff, hub: true });
  });

  it('retorna true para "TRUE " (case/whitespace insensível)', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'TRUE ';
    expect(getPublicFlags()).toEqual({ ...allOff, hub: true });
  });

  it('retorna false para qualquer outro valor', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'false';
    expect(getPublicFlags()).toEqual(allOff);

    process.env.INTELLIGENCE_HUB_ENABLED = '1';
    expect(getPublicFlags()).toEqual(allOff);
  });

  it('cada env controla apenas a sua chave', () => {
    const pairs: Array<[string, string]> = [
      ['TOOL_REGISTRY_ENABLED', 'toolreg'],
      ['SAFETY_CLASSIFIER_ENABLED', 'safety'],
      ['GRAPHRAG_ENABLED', 'graphrag'],
      ['LIVE_TRANSLATION_ENABLED', 'translate'],
      ['PROMPT_COMPRESSION_ENABLED', 'compression'],
      ['FEATURE_STORE_ENABLED', 'features'],
      ['BANDIT_ENABLED', 'bandit'],
      ['DRIFT_DETECTION_ENABLED', 'drift'],
      ['AGENT_SANDBOX_ENABLED', 'sandbox'],
      ['SYNTH_DATA_ENABLED', 'synthdata'],
      ['PROVIDER_FAILOVER_ENABLED', 'failover'],
      ['REPLAY_ENGINE_ENABLED', 'replay'],
      ['CHURN_ENGINE', 'churn'],
      ['OTEL_ENABLED', 'otel'],
      ['LTV_ENABLED', 'ltv'],
      ['MODEL_ELO_ENABLED', 'elo'],
      ['ACTIVE_LEARNING_ENABLED', 'activelearn'],
      ['OCR_MULTILAYOUT_ENABLED', 'reviewqueue'],
      ['MCP_SERVER_ENABLED', 'mcp'],
      ['BROWSING_ENABLED', 'browse'],
      ['CONSTITUTIONAL_LOOP_ENABLED', 'constitution'],
      ['COMM_PROFILE_ENABLED', 'commprofile'],
      ['EDGE_INFERENCE_MODE', 'edgeinfer'],
      ['LATENCY_BUDGET_ENABLED', 'latencybudget'],
      ['NETWORK_ANOMALY_ENABLED', 'netanomaly'],
      ['DEMAND_FORECAST_ENABLED', 'forecast'],
      ['VOICE_QA_ENABLED', 'voiceqa'],
      ['VOICE_PII_MASK_ENABLED', 'voicepii'],
      ['VOICE_BIOMETRICS_ENABLED', 'voicebio'],
    ];
    for (const [env, key] of pairs) {
      for (const e of FLAG_ENVS) delete process.env[e];
      process.env[env] = 'true';
      expect(getPublicFlags()).toEqual({ ...allOff, [key]: true });
    }
  });

  it('costdrill (client-only) é sempre true, sem env', () => {
    expect(getPublicFlags().costdrill).toBe(true);
  });

  it('não vaza env fora do mapa de flags', () => {
    process.env.SUPER_SECRET_TOKEN = 'true';
    const flags = getPublicFlags();
    expect(flags).not.toHaveProperty('SUPER_SECRET_TOKEN');
    expect(flags).not.toHaveProperty('super_secret_token');
  });
});
