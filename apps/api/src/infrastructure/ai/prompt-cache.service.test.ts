import { describe, it, expect, vi, beforeEach } from 'vitest';

const redisMock = {
  get: vi.fn(() => null as string | null),
  setex: vi.fn(),
  del: vi.fn(),
};

vi.mock('../cache/redis.client', () => ({
  getRedisClient: () => redisMock,
}));

vi.mock('../database/supabase.client', () => {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn(() => ({
      data: [
        { filename: 'manual-router.pdf', summary: 'Guia de configuração de roteadores.' },
      ],
    })),
    single: vi.fn(() => ({
      data: {
        name: 'ISP Teste',
        ai_persona: 'Astrum Bot',
        business_rules: 'Atender com cordialidade.',
        plan: 'pro',
      },
    })),
  };
  return {
    supabase: {
      from: vi.fn(() => chainable),
    },
  };
});

describe('PromptCacheService', () => {
  beforeEach(() => {
    redisMock.get.mockImplementation(() => null);
  });

  it('constrói system prompt com persona do tenant', async () => {
    const { PromptCacheService } = await import('./prompt-cache.service');
    const service = new PromptCacheService();

    const prompt = await service.getSystemPrompt('tenant-test');

    expect(prompt).toContain('ISP Teste');
    expect(prompt).toContain('Astrum Bot');
    expect(prompt).toContain('manual-router.pdf');
    expect(prompt).toContain('passo a passo');
  });

  it('retorna prompt do Redis cache quando disponível', async () => {
    redisMock.get.mockImplementation(() => JSON.stringify({
      tenantId: 'tenant-test',
      systemPrompt: 'Prompt cacheado do Redis',
      tokenCount: 100,
    }));

    const { PromptCacheService } = await import('./prompt-cache.service');
    const service = new PromptCacheService();

    const prompt = await service.getSystemPrompt('tenant-test');
    expect(prompt).toBe('Prompt cacheado do Redis');
  });

  it('invalida cache sem erro', async () => {
    const { PromptCacheService } = await import('./prompt-cache.service');
    const service = new PromptCacheService();
    await expect(service.invalidate('tenant-test')).resolves.not.toThrow();
  });
});

describe('FewShotService', () => {
  beforeEach(() => {
    redisMock.get.mockImplementation(() => null);
  });

  it('retorna string vazia quando Qdrant falha (fail-open)', async () => {
    const { FewShotService } = await import('./few-shot.service');

    const qdrantMock = {
      search: vi.fn(() => { throw new Error('Qdrant timeout'); }),
    };

    const openaiMock = {
      embeddings: { create: vi.fn(() => ({ data: [{ embedding: new Array(1536).fill(0) }] })) },
    };

    const service = new FewShotService(qdrantMock as any, openaiMock as any);
    const result = await service.buildFewShotContext('Minha internet caiu', 'tenant-test');

    expect(result).toBe(''); // fail-open: retorna vazio, não explode
  });

  it('formata exemplos corretamente quando Qdrant retorna resultados', async () => {
    const { FewShotService } = await import('./few-shot.service');

    const qdrantMock = {
      search: vi.fn(() => ([{
        payload: {
          customerMessage: 'Internet caindo',
          agentResolution: 'Reiniciamos a porta PON.',
          category: 'technical',
          satisfaction_score: 5,
          status: 'resolved',
          has_resolution: true,
        },
        score: 0.92,
      }])),
    };

    const openaiMock = {
      embeddings: { create: vi.fn(() => ({ data: [{ embedding: new Array(1536).fill(0) }] })) },
    };

    const service = new FewShotService(qdrantMock as any, openaiMock as any);
    const result = await service.buildFewShotContext('Internet caindo', 'tenant-test');

    expect(result).toContain('EXEMPLO 1');
    expect(result).toContain('Internet caindo');
    expect(result).toContain('Reiniciamos a porta PON');
    expect(result).toContain('score de satisfação: 5');
  });
});
