import { describe, it, expect, vi } from 'vitest';
import { AgentStateSchema, initialState } from './agent.state';

vi.mock('../../infrastructure/ai/guardrails.service', () => ({
  guardrailsService: { check: vi.fn() }
}));
vi.mock('../../infrastructure/ai/vercel-ai.service', () => ({
  vercelAIService: {}
}));
vi.mock('../../infrastructure/rag/hybrid-search.service', () => ({
  hybridSearchService: {}
}));
vi.mock('../../infrastructure/memory/memory-composer.service', () => ({
  memoryComposerService: {}
}));
vi.mock('../../infrastructure/ai/tools.executor', () => ({
  ToolsExecutor: class {}
}));
vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabase: {}
}));

describe('AgentState', () => {
  it('initialState cria estado válido', () => {
    const state = initialState({
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      conversationId: 'conv-1',
      userMessage: 'Internet caiu',
    });

    expect(state.steps).toEqual([]);
    expect(state.tokensUsed).toBe(0);
    expect(state.tenantId).toBe('tenant-1');
  });

  it('schema rejeita intent inválida', () => {
    expect(() => AgentStateSchema.parse({
      tenantId: 't',
      customerId: 'c',
      conversationId: 'conv',
      userMessage: 'msg',
      intent: 'invalid_intent',
      steps: [],
      startedAt: new Date().toISOString(),
      tokensUsed: 0,
    })).toThrow();
  });
});

describe('nodeDecideSource — Agentic RAG', () => {
  it('intent técnica → qdrant', async () => {
    const { nodeDecideSource } = await import('./agent.nodes');
    const state = initialState({
      tenantId: 't', customerId: 'c', conversationId: 'conv',
      userMessage: 'Como configurar o PPPoE?',
    });
    state.intent = 'support_technical';

    const patch = await nodeDecideSource(state);
    expect(patch.dataSource).toBe('qdrant');
  });

  it('intent de billing → supabase', async () => {
    const { nodeDecideSource } = await import('./agent.nodes');
    const state = initialState({
      tenantId: 't', customerId: 'c', conversationId: 'conv',
      userMessage: 'Quanto devo este mês?',
    });
    state.intent = 'support_billing';

    const patch = await nodeDecideSource(state);
    expect(patch.dataSource).toBe('supabase');
  });

  it('mensagem conversacional → none', async () => {
    const { nodeDecideSource } = await import('./agent.nodes');
    const state = initialState({
      tenantId: 't', customerId: 'c', conversationId: 'conv',
      userMessage: 'Obrigado, até mais!',
    });
    state.intent = 'other';

    const patch = await nodeDecideSource(state);
    expect(patch.dataSource).toBe('none');
  });
});

describe('nodeValidate', () => {
  it('resposta válida passa na validação', async () => {
    const { nodeValidate } = await import('./agent.nodes');
    const state = initialState({
      tenantId: 't', customerId: 'c', conversationId: 'conv',
      userMessage: 'Internet caiu',
    });
    state.response = 'Para resolver o problema de sinal, reinicie o roteador pressionando o botão por 10 segundos.';
    state.intent = 'support_technical';

    const patch = await nodeValidate(state);
    expect(patch.validationPassed).toBe(true);
  });

  it('alucinação é detectada', async () => {
    const { nodeValidate } = await import('./agent.nodes');
    const state = initialState({
      tenantId: 't', customerId: 'c', conversationId: 'conv',
      userMessage: 'Qual é meu plano?',
    });
    state.response = 'Como IA da OpenAI, não tenho acesso aos seus dados.';
    state.intent = 'check_status';

    const patch = await nodeValidate(state);
    expect(patch.validationPassed).toBe(false);
    expect(patch.validationIssue).toContain('Alucinação');
  });

  it('resposta vazia falha validação', async () => {
    const { nodeValidate } = await import('./agent.nodes');
    const state = initialState({
      tenantId: 't', customerId: 'c', conversationId: 'conv',
      userMessage: 'Teste',
    });
    state.response = '';

    const patch = await nodeValidate(state);
    expect(patch.validationPassed).toBe(false);
  });
});
