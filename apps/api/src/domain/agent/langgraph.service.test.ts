import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// ─────────────────────────────────────────────────────────────────────────────
// Cobertura REAL do grafo: exercita buildAgentGraph() + LangGraphService.processMessage()
// mockando ./agent.nodes para controlar o roteamento (happy / block / escalate / catch).
// ─────────────────────────────────────────────────────────────────────────────
describe('LangGraphService.processMessage — grafo completo', () => {
  // Mutável por teste — as funções mock fecham sobre este objeto por referência.
  const nodeResults = {
    guardPassed: true,
    validationPassed: true,
    requiresHuman: false,
    classifyThrows: false,
  };

  const input = {
    tenantId: 't1', customerId: 'c1', conversationId: 'conv1',
    userMessage: 'Minha internet caiu',
  };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock('./agent.nodes', () => ({
      nodeClassify: async () => {
        if (nodeResults.classifyThrows) throw new Error('boom-classify');
        return { intent: 'support_technical' };
      },
      nodeGuardrails:   async () => ({ guardPassed: nodeResults.guardPassed }),
      nodeDecideSource: async () => ({ dataSource: 'qdrant' }),
      nodeFetchContext: async () => ({ ragContext: 'contexto-fake' }),
      nodeGenerate:     async () => ({ response: 'resposta-gerada' }),
      nodeValidate:     async () => ({
        validationPassed: nodeResults.validationPassed,
        requiresHuman: nodeResults.requiresHuman,
      }),
      nodeEscalate: async () => ({ response: 'escalado-humano', requiresHuman: true }),
      nodeBlock:    async () => ({ response: 'mensagem-bloqueada', requiresHuman: true }),
    }));
  });

  afterEach(() => {
    nodeResults.guardPassed = true;
    nodeResults.validationPassed = true;
    nodeResults.requiresHuman = false;
    nodeResults.classifyThrows = false;
    vi.restoreAllMocks();
  });

  it('caminho feliz: guardrails ok + validação ok → resposta gerada', async () => {
    const { langGraphService } = await import('./langgraph.service');
    const out = await langGraphService.processMessage(input);
    expect(out.response).toBe('resposta-gerada');
    expect(out.requiresHuman).toBe(false);
  });

  it('guardrails reprova → nó block encerra o grafo', async () => {
    nodeResults.guardPassed = false;
    const { langGraphService } = await import('./langgraph.service');
    const out = await langGraphService.processMessage(input);
    expect(out.response).toBe('mensagem-bloqueada');
    expect(out.requiresHuman).toBe(true);
  });

  it('validação reprova → nó escalate encerra o grafo', async () => {
    nodeResults.validationPassed = false;
    const { langGraphService } = await import('./langgraph.service');
    const out = await langGraphService.processMessage(input);
    expect(out.response).toBe('escalado-humano');
    expect(out.requiresHuman).toBe(true);
  });

  it('erro fatal dentro de um nó → catch devolve fallback + requiresHuman', async () => {
    nodeResults.classifyThrows = true;
    const { langGraphService } = await import('./langgraph.service');
    const out = await langGraphService.processMessage(input);
    expect(out.requiresHuman).toBe(true);
    expect(out.response).toContain('erro interno');
  });
});
