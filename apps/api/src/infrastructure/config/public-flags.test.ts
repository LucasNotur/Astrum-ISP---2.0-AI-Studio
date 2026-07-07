import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPublicFlags } from './public-flags';

/** Baseline com todas as flags do whitelist desligadas — cada sessão IA-XX adiciona a sua aqui. */
const allOff = {
  hub: false,
  toolreg: false,
  sandbox: false,
  synthdata: false,
  failover: false,
};

const FLAG_ENVS = [
  'INTELLIGENCE_HUB_ENABLED',
  'TOOL_REGISTRY_ENABLED',
  'AGENT_SANDBOX_ENABLED',
  'SYNTH_DATA_ENABLED',
  'PROVIDER_FAILOVER_ENABLED',
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

  it('retorna false quando a env está ausente', () => {
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

  it('IA-19: TOOL_REGISTRY_ENABLED controla a chave toolreg', () => {
    process.env.TOOL_REGISTRY_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ ...allOff, toolreg: true });
  });

  it('IA-44: AGENT_SANDBOX_ENABLED controla a chave sandbox', () => {
    process.env.AGENT_SANDBOX_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ ...allOff, sandbox: true });
  });

  it('IA-45: SYNTH_DATA_ENABLED controla a chave synthdata', () => {
    process.env.SYNTH_DATA_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ ...allOff, synthdata: true });
  });

  it('IA-43: PROVIDER_FAILOVER_ENABLED controla a chave failover', () => {
    process.env.PROVIDER_FAILOVER_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ ...allOff, failover: true });
  });

  it('não vaza env fora do mapa de flags', () => {
    process.env.SUPER_SECRET_TOKEN = 'true';
    const flags = getPublicFlags();
    expect(flags).not.toHaveProperty('SUPER_SECRET_TOKEN');
    expect(flags).not.toHaveProperty('super_secret_token');
  });
});
