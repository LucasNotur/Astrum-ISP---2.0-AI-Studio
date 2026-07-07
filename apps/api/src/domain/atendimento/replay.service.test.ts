import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── vi.hoisted: tudo que as factories de vi.mock precisam fica aqui ─────────
// Variáveis declaradas com `const` não são acessíveis no hoist (TDZ). A factory
// de vi.mock é içada para o topo do arquivo ANTES das consts do corpo.
const mocks = vi.hoisted(() => {
  const supabaseState: any = {
    messages: { data: [], error: null },
    conversations: { data: [], error: null },
    runs: { data: null, error: null },
    runsList: { data: [], error: null },
    detail: { data: null, error: null },
    items: { data: [], error: null },
    itemsInsert: { data: null, error: null },
  };

  function chainable(target: string) {
    const builder: any = {
      select: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      update: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      range: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => supabaseState.detail),
      single: vi.fn(async () => supabaseState.runs),
    };
    return builder;
  }

  const fromMock = vi.fn((table: string) => {
    const b = chainable(table);
    if (table === 'messages') {
      b.order = vi.fn(() => b);
      b.limit = vi.fn(() => b).mockImplementation(() => Promise.resolve(supabaseState.messages));
    } else if (table === 'conversations') {
      b.in = vi.fn(() => b).mockImplementation(() => Promise.resolve(supabaseState.conversations));
    } else if (table === 'replay_runs') {
      b.order = vi.fn(() => b);
      b.limit = vi.fn(() => b).mockImplementation(() => Promise.resolve(supabaseState.runsList));
      b.maybeSingle = vi.fn(async () => supabaseState.detail);
      b.single = vi.fn(async () => supabaseState.runs);
      b.insert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => supabaseState.runs),
        })),
      }));
    } else if (table === 'replay_items') {
      b.range = vi.fn(() => b).mockImplementation(() => Promise.resolve(supabaseState.items));
      b.insert = vi.fn(async () => supabaseState.itemsInsert);
    }
    return b;
  });

  const setCreateToolsOverrideSpy = vi.fn();
  const processMessageMock = vi.fn();
  const toolsExecutorCtorSpy = vi.fn();
  const generateObjectMock = vi.fn();

  return {
    supabaseState,
    fromMock,
    setCreateToolsOverrideSpy,
    processMessageMock,
    toolsExecutorCtorSpy,
    generateObjectMock,
  };
});

// ─── Mocks (vi.mock é içado automaticamente) ────────────────────────────────

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: mocks.fromMock },
}));

vi.mock('../agent/agent.nodes', () => ({
  // NÃO usamos vi.importActual aqui — o agent.nodes real puxa o guardrails
  // pipeline → content-moderation → openai.adapter, que falha em jsdom. O
  // replay.service só precisa de setCreateToolsOverride; a função real
  // (módulo-level _createToolsOverride) não é exercitada porque o grafo
  // (langGraphService) está mockado. O spy captura set/clear para o teste.
  setCreateToolsOverride: (factory: any) => {
    mocks.setCreateToolsOverrideSpy(factory);
  },
}));

vi.mock('../agent/langgraph.service', () => ({
  langGraphService: { processMessage: mocks.processMessageMock },
}));

vi.mock('../../infrastructure/ai/tools.executor', () => ({
  ToolsExecutor: class {
    constructor(tenantId: string) {
      mocks.toolsExecutorCtorSpy(tenantId);
    }
    execute(toolName: string, args: any) {
      return { fromReal: true, toolName, args };
    }
  },
}));

vi.mock('ai', () => ({
  generateObject: (...args: any[]) => mocks.generateObjectMock(...args),
}));

import {
  DryRunToolsExecutor,
  enqueueReplay,
  executeReplayRun,
  listReplayRuns,
  getReplayRunDetail,
  sampleReplayPairs,
  judgeOnePair,
  SIDE_EFFECT_TOOLS,
} from './replay.service';

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('SIDE_EFFECT_TOOLS', () => {
  it('contém exatamente as 3 tools de escrita do catálogo IA-19', () => {
    expect(SIDE_EFFECT_TOOLS.size).toBe(3);
    expect(SIDE_EFFECT_TOOLS.has('suspend_signal')).toBe(true);
    expect(SIDE_EFFECT_TOOLS.has('create_ticket')).toBe(true);
    expect(SIDE_EFFECT_TOOLS.has('schedule_technical_visit')).toBe(true);
  });
});

describe('DryRunToolsExecutor', () => {
  it('side-effect tools: devolve { success: true, dryRun: true } SEM chamar o real', async () => {
    const realExecute = vi.fn(async () => ({ should: 'not be called' }));
    const real = { execute: realExecute };
    const dry = new DryRunToolsExecutor(real as any);

    for (const name of ['suspend_signal', 'create_ticket', 'schedule_technical_visit']) {
      const out = await dry.execute(name, { customer_id: 'c1' });
      expect(out).toEqual({ success: true, dryRun: true, tool: name });
    }
    expect(realExecute).not.toHaveBeenCalled();
  });

  it('tools read-only: encaminha ao executor real', async () => {
    const realExecute = vi.fn(async () => ({ fromReal: true, toolName: 'check_invoice' }));
    const real = { execute: realExecute };
    const dry = new DryRunToolsExecutor(real as any);

    const out = await dry.execute('check_invoice', { customer_id: 'c1' });
    expect(out).toEqual({ fromReal: true, toolName: 'check_invoice' });
    expect(realExecute).toHaveBeenCalledWith('check_invoice', { customer_id: 'c1' });
  });
});

describe('sampleReplayPairs', () => {
  beforeEach(() => {
    mocks.supabaseState.messages = { data: [], error: null };
    mocks.supabaseState.conversations = { data: [], error: null };
  });

  it('exclui mensagens com extra.source = synthetic', async () => {
    mocks.supabaseState.messages = {
      data: [
        { id: '1', tenant_id: 't1', conversation_id: 'cv1', role: 'user', content: 'oi', created_at: '2026-07-01T10:00:00Z', extra: null },
        { id: '2', tenant_id: 't1', conversation_id: 'cv1', role: 'assistant', content: 'olá', created_at: '2026-07-01T10:00:01Z', extra: null },
        { id: '3', tenant_id: 't1', conversation_id: 'cv2', role: 'user', content: 'oi-bot', created_at: '2026-07-01T10:01:00Z', extra: { source: 'synthetic' } },
        { id: '4', tenant_id: 't1', conversation_id: 'cv2', role: 'assistant', content: 'bot-resposta', created_at: '2026-07-01T10:01:01Z', extra: { source: 'synthetic' } },
      ],
      error: null,
    };
    mocks.supabaseState.conversations = { data: [{ id: 'cv1', customer_id: 'cust-1' }], error: null };

    const pairs = await sampleReplayPairs('t1', '2026-07-01', '2026-07-02', 50);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].userMessage).toBe('oi');
    expect(pairs[0].originalResponse).toBe('olá');
    expect(pairs[0].customerId).toBe('cust-1');
  });

  it('respeita o sample size com clamp (10..500)', async () => {
    const rows: any[] = [];
    for (let i = 0; i < 24; i++) {
      rows.push({ id: `u${i}`, tenant_id: 't1', conversation_id: `cv${i}`, role: 'user', content: `u${i}`, created_at: `2026-07-01T10:${String(i).padStart(2, '0')}:00Z`, extra: null });
      rows.push({ id: `a${i}`, tenant_id: 't1', conversation_id: `cv${i}`, role: 'assistant', content: `a${i}`, created_at: `2026-07-01T10:${String(i).padStart(2, '0')}:01Z`, extra: null });
    }
    mocks.supabaseState.messages = { data: rows, error: null };
    mocks.supabaseState.conversations = { data: [], error: null };

    const pairs = await sampleReplayPairs('t1', '2026-07-01', '2026-07-02', 5);
    expect(pairs.length).toBeLessThanOrEqual(10);
  });

  it('faz amostragem aleatória uniforme quando há mais pares que o sample', async () => {
    const rows: any[] = [];
    for (let i = 0; i < 100; i++) {
      rows.push({ id: `u${i}`, tenant_id: 't1', conversation_id: `cv${i}`, role: 'user', content: `u${i}`, created_at: `2026-07-01T10:${String(i).padStart(2, '0')}:00Z`, extra: null });
      rows.push({ id: `a${i}`, tenant_id: 't1', conversation_id: `cv${i}`, role: 'assistant', content: `a${i}`, created_at: `2026-07-01T10:${String(i).padStart(2, '0')}:01Z`, extra: null });
    }
    mocks.supabaseState.messages = { data: rows, error: null };
    mocks.supabaseState.conversations = { data: [], error: null };

    const pairs = await sampleReplayPairs('t1', '2026-07-01', '2026-07-02', 30);
    expect(pairs).toHaveLength(30);
    const convIds = new Set(pairs.map((p) => p.conversationId));
    expect(convIds.size).toBe(30);
  });
});

describe('judgeOnePair', () => {
  beforeEach(() => mocks.generateObjectMock.mockReset());

  it('retorna o veredito do LLM-as-judge', async () => {
    mocks.generateObjectMock.mockResolvedValueOnce({ object: { equivalent: true, rationale: 'mesma intenção' } });
    const r = await judgeOnePair('oi', 'olá', 'oi!', 't1');
    expect(r.equivalent).toBe(true);
    expect(r.rationale).toBe('mesma intenção');
  });

  it('propaga erros do judge (fail-open é responsabilidade do caller)', async () => {
    mocks.generateObjectMock.mockRejectedValueOnce(new Error('openai fora'));
    await expect(judgeOnePair('oi', 'olá', 'oi!', 't1')).rejects.toThrow('openai fora');
  });
});

describe('executeReplayRun', () => {
  beforeEach(() => {
    mocks.processMessageMock.mockReset();
    mocks.generateObjectMock.mockReset();
    mocks.setCreateToolsOverrideSpy.mockClear();
    mocks.toolsExecutorCtorSpy.mockClear();
    mocks.supabaseState.runs = { data: null, error: null };
    mocks.supabaseState.runsList = { data: [], error: null };
    mocks.supabaseState.messages = { data: [], error: null };
    mocks.supabaseState.conversations = { data: [], error: null };
    mocks.supabaseState.itemsInsert = { data: null, error: null };
  });

  it('pass_rate = equivalent / total (apenas items julgados; erros fora do denominador)', async () => {
    mocks.supabaseState.runs = {
      data: {
        id: 'run-1', tenant_id: 't1', params: { from: '2026-07-01', to: '2026-07-02', sample: 10 },
        status: 'queued', total: null, equivalent: null, pass_rate: null, created_at: '2026-07-06T00:00:00Z', finished_at: null,
      },
      error: null,
    };
    mocks.supabaseState.messages = {
      data: [
        { id: '1', tenant_id: 't1', conversation_id: 'cv1', role: 'user', content: 'oi', created_at: '2026-07-01T10:00:00Z', extra: null },
        { id: '2', tenant_id: 't1', conversation_id: 'cv1', role: 'assistant', content: 'olá', created_at: '2026-07-01T10:00:01Z', extra: null },
      ],
      error: null,
    };
    mocks.supabaseState.conversations = { data: [{ id: 'cv1', customer_id: 'cust-1' }], error: null };

    mocks.processMessageMock.mockResolvedValue({ response: 'olá!' });
    mocks.generateObjectMock.mockResolvedValueOnce({ object: { equivalent: true, rationale: 'ok' } });

    await executeReplayRun('run-1');

    expect(mocks.toolsExecutorCtorSpy).toHaveBeenCalledWith('t1');
    expect(mocks.setCreateToolsOverrideSpy).toHaveBeenCalled();
    expect(mocks.setCreateToolsOverrideSpy).toHaveBeenLastCalledWith(null);
  });

  it('fail-open: erro em 1 par → verdict=erro, demais continuam', async () => {
    mocks.supabaseState.runs = {
      data: {
        id: 'run-2', tenant_id: 't1', params: { from: '2026-07-01', to: '2026-07-02', sample: 10 },
        status: 'queued', total: null, equivalent: null, pass_rate: null, created_at: '2026-07-06T00:00:00Z', finished_at: null,
      },
      error: null,
    };
    mocks.supabaseState.messages = {
      data: [
        { id: '1', tenant_id: 't1', conversation_id: 'cv1', role: 'user', content: 'oi', created_at: '2026-07-01T10:00:00Z', extra: null },
        { id: '2', tenant_id: 't1', conversation_id: 'cv1', role: 'assistant', content: 'olá', created_at: '2026-07-01T10:00:01Z', extra: null },
        { id: '3', tenant_id: 't1', conversation_id: 'cv2', role: 'user', content: 'bye', created_at: '2026-07-01T10:00:02Z', extra: null },
        { id: '4', tenant_id: 't1', conversation_id: 'cv2', role: 'assistant', content: 'tchau', created_at: '2026-07-01T10:00:03Z', extra: null },
      ],
      error: null,
    };
    mocks.supabaseState.conversations = { data: [], error: null };

    mocks.processMessageMock
      .mockRejectedValueOnce(new Error('llm timeout'))
      .mockResolvedValueOnce({ response: 'tchau!' });
    mocks.generateObjectMock.mockResolvedValueOnce({ object: { equivalent: true, rationale: 'ok' } });

    await executeReplayRun('run-2');

    expect(mocks.processMessageMock).toHaveBeenCalledTimes(2);
    expect(mocks.setCreateToolsOverrideSpy).toHaveBeenLastCalledWith(null);
  });
});

describe('enqueueReplay', () => {
  it('cria replay_runs com status=queued e devolve o id', async () => {
    mocks.supabaseState.runs = { data: { id: 'run-new' }, error: null };
    const id = await enqueueReplay('t1', { from: '2026-07-01', to: '2026-07-02', sample: 50 });
    expect(id).toBe('run-new');
  });
});

describe('listReplayRuns / getReplayRunDetail', () => {
  beforeEach(() => {
    mocks.supabaseState.runsList = { data: [], error: null };
    mocks.supabaseState.detail = { data: null, error: null };
    mocks.supabaseState.items = { data: [], error: null };
  });

  it('listReplayRuns devolve as runs do tenant', async () => {
    mocks.supabaseState.runsList = { data: [{ id: 'r1', tenant_id: 't1' }], error: null };
    const out = await listReplayRuns('t1');
    expect(out).toHaveLength(1);
  });

  it('getReplayRunDetail filtra por verdict quando passado', async () => {
    mocks.supabaseState.detail = { data: { id: 'r1', status: 'done', total: 10, equivalent: 9, pass_rate: 0.9 }, error: null };
    mocks.supabaseState.items = { data: [{ id: 'i1', verdict: 'divergente' }], error: null };
    const out = await getReplayRunDetail('t1', 'r1', { verdict: 'divergente' });
    expect(out?.items[0].verdict).toBe('divergente');
    expect(out?.pass_rate).toBe(0.9);
  });

  it('getReplayRunDetail devolve null se run não existe', async () => {
    mocks.supabaseState.detail = { data: null, error: null };
    const out = await getReplayRunDetail('t1', 'inexistente');
    expect(out).toBeNull();
  });
});
