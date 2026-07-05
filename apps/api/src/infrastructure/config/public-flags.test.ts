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
    delete process.env.SAFETY_CLASSIFIER_ENABLED;
    delete process.env.GRAPHRAG_ENABLED;
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: false, graphrag: false });
  });

  it('retorna true para "true"', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: true, toolreg: false, safety: false, graphrag: false });
  });

  it('retorna true para "TRUE " (case/whitespace insensível)', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'TRUE ';
    expect(getPublicFlags()).toEqual({ hub: true, toolreg: false, safety: false, graphrag: false });
  });

  it('retorna false para qualquer outro valor', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'false';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: false, graphrag: false });

    process.env.INTELLIGENCE_HUB_ENABLED = '1';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: false, graphrag: false });
  });

  it('IA-19: TOOL_REGISTRY_ENABLED controla a chave toolreg', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.SAFETY_CLASSIFIER_ENABLED;
    delete process.env.GRAPHRAG_ENABLED;
    process.env.TOOL_REGISTRY_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: true, safety: false, graphrag: false });
  });

  it('IA-21: SAFETY_CLASSIFIER_ENABLED controla a chave safety', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.TOOL_REGISTRY_ENABLED;
    delete process.env.GRAPHRAG_ENABLED;
    process.env.SAFETY_CLASSIFIER_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: true, graphrag: false });
  });

  it('IA-16: GRAPHRAG_ENABLED controla a chave graphrag', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.TOOL_REGISTRY_ENABLED;
    delete process.env.SAFETY_CLASSIFIER_ENABLED;
    process.env.GRAPHRAG_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: false, graphrag: true });
  });

  it('não vaza env fora do mapa de flags', () => {
    process.env.SUPER_SECRET_TOKEN = 'true';
    const flags = getPublicFlags();
    expect(flags).not.toHaveProperty('SUPER_SECRET_TOKEN');
    expect(flags).not.toHaveProperty('super_secret_token');
  });
});
