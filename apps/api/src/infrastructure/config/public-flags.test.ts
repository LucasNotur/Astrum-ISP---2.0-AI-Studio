import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPublicFlags } from './public-flags';

describe('public-flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('retorna false quando a env está ausente', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.TOOL_REGISTRY_ENABLED;
    delete process.env.AGENT_SANDBOX_ENABLED;
    delete process.env.SYNTH_DATA_ENABLED;
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, sandbox: false, synthdata: false });
  });

  it('retorna true para "true"', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: true, toolreg: false, sandbox: false, synthdata: false });
  });

  it('retorna true para "TRUE " (case/whitespace insensível)', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'TRUE ';
    expect(getPublicFlags()).toEqual({ hub: true, toolreg: false, sandbox: false, synthdata: false });
  });

  it('retorna false para qualquer outro valor', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'false';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, sandbox: false, synthdata: false });

    process.env.INTELLIGENCE_HUB_ENABLED = '1';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, sandbox: false, synthdata: false });
  });

  it('IA-19: TOOL_REGISTRY_ENABLED controla a chave toolreg', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    process.env.TOOL_REGISTRY_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: true, sandbox: false, synthdata: false });
  });

  it('IA-44: AGENT_SANDBOX_ENABLED controla a chave sandbox', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.TOOL_REGISTRY_ENABLED;
    process.env.AGENT_SANDBOX_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, sandbox: true, synthdata: false });
  });

  it('IA-45: SYNTH_DATA_ENABLED controla a chave synthdata', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.TOOL_REGISTRY_ENABLED;
    delete process.env.AGENT_SANDBOX_ENABLED;
    process.env.SYNTH_DATA_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, sandbox: false, synthdata: true });
  });

  it('não vaza env fora do mapa de flags', () => {
    process.env.SUPER_SECRET_TOKEN = 'true';
    const flags = getPublicFlags();
    expect(flags).not.toHaveProperty('SUPER_SECRET_TOKEN');
    expect(flags).not.toHaveProperty('super_secret_token');
  });
});
