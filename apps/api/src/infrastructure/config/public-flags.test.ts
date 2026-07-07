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
  costdrill: true, // client-only
  sandbox: false,
  synthdata: false,
  failover: false,
  replay: false,
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
