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
    delete process.env.LIVE_TRANSLATION_ENABLED;
    delete process.env.PROMPT_COMPRESSION_ENABLED;
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: false, graphrag: false, translate: false, compression: false });
  });

  it('retorna true para "true"', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: true, toolreg: false, safety: false, graphrag: false, translate: false, compression: false });
  });

  it('retorna true para "TRUE " (case/whitespace insensível)', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'TRUE ';
    expect(getPublicFlags()).toEqual({ hub: true, toolreg: false, safety: false, graphrag: false, translate: false, compression: false });
  });

  it('retorna false para qualquer outro valor', () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'false';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: false, graphrag: false, translate: false, compression: false });

    process.env.INTELLIGENCE_HUB_ENABLED = '1';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: false, graphrag: false, translate: false, compression: false });
  });

  it('IA-19: TOOL_REGISTRY_ENABLED controla a chave toolreg', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.SAFETY_CLASSIFIER_ENABLED;
    delete process.env.GRAPHRAG_ENABLED;
    delete process.env.LIVE_TRANSLATION_ENABLED;
    delete process.env.PROMPT_COMPRESSION_ENABLED;
    process.env.TOOL_REGISTRY_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: true, safety: false, graphrag: false, translate: false, compression: false });
  });

  it('IA-21: SAFETY_CLASSIFIER_ENABLED controla a chave safety', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.TOOL_REGISTRY_ENABLED;
    delete process.env.GRAPHRAG_ENABLED;
    delete process.env.LIVE_TRANSLATION_ENABLED;
    delete process.env.PROMPT_COMPRESSION_ENABLED;
    process.env.SAFETY_CLASSIFIER_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: true, graphrag: false, translate: false, compression: false });
  });

  it('IA-16: GRAPHRAG_ENABLED controla a chave graphrag', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.TOOL_REGISTRY_ENABLED;
    delete process.env.SAFETY_CLASSIFIER_ENABLED;
    delete process.env.LIVE_TRANSLATION_ENABLED;
    delete process.env.PROMPT_COMPRESSION_ENABLED;
    process.env.GRAPHRAG_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: false, graphrag: true, translate: false, compression: false });
  });

  it('IA-14: LIVE_TRANSLATION_ENABLED controla a chave translate', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.TOOL_REGISTRY_ENABLED;
    delete process.env.SAFETY_CLASSIFIER_ENABLED;
    delete process.env.GRAPHRAG_ENABLED;
    delete process.env.PROMPT_COMPRESSION_ENABLED;
    process.env.LIVE_TRANSLATION_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: false, graphrag: false, translate: true, compression: false });
  });

  it('IA-30: PROMPT_COMpression_ENABLED controla a chave compression', () => {
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.TOOL_REGISTRY_ENABLED;
    delete process.env.SAFETY_CLASSIFIER_ENABLED;
    delete process.env.GRAPHRAG_ENABLED;
    delete process.env.LIVE_TRANSLATION_ENABLED;
    process.env.PROMPT_COMPRESSION_ENABLED = 'true';
    expect(getPublicFlags()).toEqual({ hub: false, toolreg: false, safety: false, graphrag: false, translate: false, compression: true });
  });

  it('não vaza env fora do mapa de flags', () => {
    process.env.SUPER_SECRET_TOKEN = 'true';
    const flags = getPublicFlags();
    expect(flags).not.toHaveProperty('SUPER_SECRET_TOKEN');
    expect(flags).not.toHaveProperty('super_secret_token');
  });
});
