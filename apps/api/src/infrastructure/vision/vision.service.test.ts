import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalEnv = { ...process.env };

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn().mockReturnValue('gpt-4o-mock'),
}));

import { isVisionStructuredEnabled, formatBoletoPrompt } from './vision.service';

beforeEach(() => {
  delete process.env.VISION_STRUCTURED_ENABLED;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('isVisionStructuredEnabled', () => {
  it('default false', () => {
    expect(isVisionStructuredEnabled()).toBe(false);
  });

  it('true com env setada', () => {
    process.env.VISION_STRUCTURED_ENABLED = 'true';
    expect(isVisionStructuredEnabled()).toBe(true);
  });
});

describe('formatBoletoPrompt', () => {
  it('formata boleto completo como system prompt extension', () => {
    const result = formatBoletoPrompt({
      linha_digitavel: '12345678901234567890123456789012345678901234567',
      valor_cents: 9990,
      vencimento: '2026-08-15',
      beneficiario: 'Concessionária',
      is_boleto: true,
      confidence: 0.95,
    });
    expect(result).toContain('R$99.90');
    expect(result).toContain('2026-08-15');
    expect(result).toContain('Compare com as faturas em aberto');
  });

  it('formata boleto parcial sem linha digitável', () => {
    const result = formatBoletoPrompt({
      valor_cents: 15000,
      vencimento: '2026-09-01',
      is_boleto: true,
      confidence: 0.7,
    });
    expect(result).toContain('R$150.00');
    expect(result).not.toContain('linha digitável');
  });
});

describe('extractBoleto', () => {
  it('flag off retorna null', async () => {
    const { extractBoleto } = await import('./vision.service');
    const result = await extractBoleto('http://img.url', 't1');
    expect(result).toBeNull();
  });

  it('confidence < 0.6 retorna null', async () => {
    process.env.VISION_STRUCTURED_ENABLED = 'true';
    const { generateObject } = await import('ai');
    (generateObject as any).mockResolvedValueOnce({
      object: { is_boleto: true, confidence: 0.4, linha_digitavel: '123' },
    });
    const { extractBoleto } = await import('./vision.service');
    const result = await extractBoleto('http://img.url', 't1');
    expect(result).toBeNull();
  });

  it('não é boleto → null', async () => {
    process.env.VISION_STRUCTURED_ENABLED = 'true';
    const { generateObject } = await import('ai');
    (generateObject as any).mockResolvedValueOnce({
      object: { is_boleto: false, confidence: 0.95 },
    });
    const { extractBoleto } = await import('./vision.service');
    const result = await extractBoleto('http://img.url', 't1');
    expect(result).toBeNull();
  });
});

describe('classifyFieldPhoto', () => {
  it('flag off retorna null', async () => {
    const { classifyFieldPhoto } = await import('./vision.service');
    const result = await classifyFieldPhoto('http://img.url', 't1');
    expect(result).toBeNull();
  });

  it('confidence < 0.6 retorna null', async () => {
    process.env.VISION_STRUCTURED_ENABLED = 'true';
    const { generateObject } = await import('ai');
    (generateObject as any).mockResolvedValueOnce({
      object: { equipment: 'roteador', issue: 'sem_problema_visivel', severity: 'baixa', recommended_action: 'Nada', confidence: 0.3 },
    });
    const { classifyFieldPhoto } = await import('./vision.service');
    const result = await classifyFieldPhoto('http://img.url', 't1');
    expect(result).toBeNull();
  });
});
