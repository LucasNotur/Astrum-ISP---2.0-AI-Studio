import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@getzep/zep-js', () => {
  return {
    ZepClient: class MockZepClient {
      memory = {
        get: vi.fn(),
        add: vi.fn(),
        delete: vi.fn(),
        getSession: vi.fn(),
        addSession: vi.fn(),
        searchSessions: vi.fn(),
      }
    }
  };
});

vi.mock('../database/supabase.client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({ data: { name: 'João Silva', email: 'joao@test.com' } })),
        })),
      })),
    })),
  },
}));

describe('ZepMemoryService', () => {
  beforeEach(() => {
    process.env.ZEP_API_URL = 'http://localhost:8000';
    process.env.ZEP_API_KEY = 'test-key';
    vi.clearAllMocks();
  });

  it('retorna null sem erro quando Zep está desabilitado', async () => {
    delete process.env.ZEP_API_URL;
    delete process.env.ZEP_API_KEY;

    const { ZepMemoryService } = await import('./zep.service');
    const service = new ZepMemoryService();

    const result = await service.getMemoryContext('cust-1', 'tenant-1', 'internet caiu');
    expect(result).toBeNull();
  });

  it('classifica entidade de plano corretamente', async () => {
    const { ZepMemoryService } = await import('./zep.service');
    const service = new ZepMemoryService();

    const type = (service as any)._classifyEntityType('Plano Fibra 300MB');
    expect(type).toBe('plan');
  });

  it('classifica entidade de equipamento corretamente', async () => {
    const { ZepMemoryService } = await import('./zep.service');
    const service = new ZepMemoryService();

    const type = (service as any)._classifyEntityType('Roteador TP-Link AX1500');
    expect(type).toBe('equipment');
  });

  it('formatForSystemPrompt retorna string vazia sem contexto', async () => {
    const { ZepMemoryService } = await import('./zep.service');
    const service = new ZepMemoryService();

    const result = service.formatForSystemPrompt(null);
    expect(result).toBe('');
  });

  it('formatForSystemPrompt inclui resumo e entidades', async () => {
    const { ZepMemoryService } = await import('./zep.service');
    const service = new ZepMemoryService();

    const context = {
      summary: 'Cliente tem Fibra 300MB com problemas recorrentes de queda.',
      entities: [{
        type: 'plan',
        name: 'Plano',
        value: 'Fibra 300MB',
        lastSeen: '2024-01-15T10:00:00Z',
      }],
      relevantFacts: ['Já abriu 3 tickets sobre queda de sinal'],
      sessionId: 'tenant-1::cust-1',
    };

    const result = service.formatForSystemPrompt(context);
    expect(result).toContain('HISTÓRICO DO CLIENTE');
    expect(result).toContain('Fibra 300MB');
    expect(result).toContain('3 tickets');
  });

  it('buildSessionId combina tenantId e customerId', async () => {
    const { ZepMemoryService } = await import('./zep.service');
    const service = new ZepMemoryService();

    const sessionId = (service as any)._buildSessionId('cust-abc', 'tenant-xyz');
    expect(sessionId).toBe('tenant-xyz::cust-abc');
  });

  it('addMessages é no-op quando Zep desabilitado', async () => {
    delete process.env.ZEP_API_URL;

    const { ZepMemoryService } = await import('./zep.service');
    const service = new ZepMemoryService();

    await expect(service.addMessages('cust-1', 'tenant-1', [
      { role: 'user', content: 'Olá' },
    ])).resolves.not.toThrow();
  });
});

describe('MemoryComposerService', () => {
  it('compõe contexto com todas as 3 camadas', async () => {
    const { zepMemoryService } = await import('./zep.service');
    
    vi.spyOn(zepMemoryService, 'getMemoryContext').mockResolvedValue({
      summary: 'Cliente antigo com Fibra 300MB.',
      entities: [],
      relevantFacts: [],
      sessionId: 'session-1',
    });
    vi.spyOn(zepMemoryService, 'formatForSystemPrompt').mockReturnValue('## HISTÓRICO: Cliente antigo com Fibra 300MB.');

    const { MemoryComposerService } = await import('./memory-composer.service');
    const composer = new MemoryComposerService();

    const result = await composer.compose({
      customerId: 'cust-1',
      tenantId: 'tenant-1',
      currentQuery: 'Internet caiu de novo',
      recentTurns: [{ role: 'user', content: 'Olá' }],
      ragContext: 'Manual de troubleshooting...',
      systemPromptBase: 'Você é o assistente Astrum.',
    });

    expect(result.systemContext).toContain('assistente Astrum');
    expect(result.tokenEstimate).toBeGreaterThan(0);
    expect(result.recentHistory.length).toBeLessThanOrEqual(6);
  });
});
