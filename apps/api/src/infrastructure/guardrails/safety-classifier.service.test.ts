import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn(() => ({})),
}));

import { classifyResponseSafety, isSafetyClassifierEnabled, SafetyVerdictSchema } from './safety-classifier.service';

const originalEnv = process.env;

describe('safety-classifier (IA-21)', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('flag off → não chama LLM e devolve safe=true (fail-open do gate)', async () => {
    process.env.SAFETY_CLASSIFIER_ENABLED = 'false';
    const { generateObject } = await import('ai');
    const v = await classifyResponseSafety('qualquer resposta', 'contexto', 't1');
    expect(v.safe).toBe(true);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('flag on: resposta com promessa sem tool de agendamento no contexto → safe=false + categoria certa', async () => {
    process.env.SAFETY_CLASSIFIER_ENABLED = 'true';
    const { generateObject } = await import('ai');
    (generateObject as any).mockResolvedValueOnce({
      object: { safe: false, categories: ['valor_ou_prazo_inventado', 'promessa_nao_autorizada'] },
    });
    const v = await classifyResponseSafety(
      'Confirmo sua visita amanhã às 14h.',
      '',
      't1',
    );
    expect(v.safe).toBe(false);
    expect(v.categories).toContain('valor_ou_prazo_inventado');
    expect(v.categories).toContain('promessa_nao_autorizada');
  });

  it('flag on: vazamento de dado de outro cliente → safe=false com dado_de_outro_cliente', async () => {
    process.env.SAFETY_CLASSIFIER_ENABLED = 'true';
    const { generateObject } = await import('ai');
    (generateObject as any).mockResolvedValueOnce({
      object: { safe: false, categories: ['dado_de_outro_cliente'] },
    });
    const v = await classifyResponseSafety(
      'O cliente João tem plano 100MB.',
      'Cliente atual: Maria',
      't1',
    );
    expect(v.safe).toBe(false);
    expect(v.categories).toEqual(['dado_de_outro_cliente']);
  });

  it('flag on: exceção do modelo → fail-open (safe=true)', async () => {
    process.env.SAFETY_CLASSIFIER_ENABLED = 'true';
    const { generateObject } = await import('ai');
    (generateObject as any).mockRejectedValueOnce(new Error('openai down'));
    const v = await classifyResponseSafety('texto', 'contexto', 't1');
    expect(v.safe).toBe(true);
    expect(v.categories).toEqual([]);
  });

  it('schema rejeita categoria fora da rubrica', () => {
    expect(() =>
      SafetyVerdictSchema.parse({ safe: false, categories: ['injection_de_prompt'] }),
    ).toThrow();
  });

  it('schema rejeita mais de 3 categorias', () => {
    expect(() =>
      SafetyVerdictSchema.parse({
        safe: false,
        categories: [
          'valor_ou_prazo_inventado',
          'promessa_nao_autorizada',
          'dado_de_outro_cliente',
          'orientacao_perigosa',
        ],
      }),
    ).toThrow();
  });

  it('isSafetyClassifierEnabled lê env normalizado', () => {
    process.env.SAFETY_CLASSIFIER_ENABLED = 'TRUE ';
    expect(isSafetyClassifierEnabled()).toBe(true);
    process.env.SAFETY_CLASSIFIER_ENABLED = 'false';
    expect(isSafetyClassifierEnabled()).toBe(false);
    delete process.env.SAFETY_CLASSIFIER_ENABLED;
    expect(isSafetyClassifierEnabled()).toBe(false);
  });
});
