import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../database/supabase.client', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('../logging/logger', () => ({
  infraLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { supabaseAdmin } from '../database/supabase.client';
import {
  MODEL_PRICING,
  computeCostUsd,
  recordMessageCost,
} from './cost-recorder';

const fromFn = vi.mocked(supabaseAdmin.from);
const insertMock = vi.fn();
fromFn.mockImplementation(() => ({ insert: insertMock } as any));

describe('MODEL_PRICING', () => {
  it('gpt-4o: inputPer1k=$0.005 / outputPer1k=$0.015', () => {
    expect(MODEL_PRICING['gpt-4o']).toEqual({ inputPer1k: 0.005, outputPer1k: 0.015 });
  });

  it('gpt-4o-mini: inputPer1k=$0.000150 / outputPer1k=$0.000600', () => {
    expect(MODEL_PRICING['gpt-4o-mini']).toEqual({ inputPer1k: 0.000150, outputPer1k: 0.000600 });
  });
});

describe('computeCostUsd — 6 casas decimais', () => {
  it('gpt-4o: 1000 in + 500 out = 0.005 + 0.0075 = 0.0125', () => {
    expect(computeCostUsd('gpt-4o', 1000, 500)).toBe(0.0125);
  });

  it('gpt-4o-mini: 1000 in + 500 out = 0.00015 + 0.0003 = 0.00045', () => {
    expect(computeCostUsd('gpt-4o-mini', 1000, 500)).toBe(0.00045);
  });

  it('gpt-4o: 1234567 in + 0 out — 6 casas (arredondamento)', () => {
    // 1234.567 * 0.005 = 6.172835
    expect(computeCostUsd('gpt-4o', 1234567, 0)).toBe(6.172835);
  });

  it('gpt-4o-mini: 250 in + 100 out — float64 representation noise (Math.round behavior)', () => {
    // (250/1000)*0.000150 + (100/1000)*0.000600 = 0.0000975
    // 0.0000975 não é representável em float64; Math.round(97.49999…)*1e-6
    // resulta em 0.000097 (não 0.000098). O teste documenta o comportamento
    // real do gravador — a coluna cost_usd NUMERIC(10,6) recebe 0.000097.
    expect(computeCostUsd('gpt-4o-mini', 250, 100)).toBe(0.000097);
  });

  it('modelo desconhecido cai no default gpt-4o-mini', () => {
    expect(computeCostUsd('foo-bar', 1000, 1000))
      .toBe(computeCostUsd('gpt-4o-mini', 1000, 1000));
  });

  it('tokens zero → custo zero', () => {
    expect(computeCostUsd('gpt-4o', 0, 0)).toBe(0);
  });
});

describe('recordMessageCost — INSERT + fail-open', () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromFn.mockClear();
  });

  it('INSERT com payload completo: tenant, customer, conv, model, tokens, cost, useCase', async () => {
    insertMock.mockResolvedValue({ error: null });

    await recordMessageCost({
      tenantId: 'tenant-1',
      customerId: 'cust-1',
      conversationId: 'conv-1',
      model: 'gpt-4o-mini',
      tokensIn: 1000,
      tokensOut: 500,
      useCase: 'agent_response',
    });

    expect(fromFn).toHaveBeenCalledWith('ai_performance_logs');
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0]![0];
    expect(payload).toMatchObject({
      tenant_id: 'tenant-1',
      customer_id: 'cust-1',
      conversation_id: 'conv-1',
      model: 'gpt-4o-mini',
      tokens_in: 1000,
      tokens_out: 500,
      use_case: 'agent_response',
    });
    // cost_usd gravado = 0.00045 (gpt-4o-mini: 1k in + 500 out)
    expect(payload.cost_usd).toBe(0.00045);
  });

  it('campos opcionais ausentes viram NULL no INSERT', async () => {
    insertMock.mockResolvedValue({ error: null });

    await recordMessageCost({
      tenantId: 'tenant-2',
      model: 'gpt-4o',
      tokensIn: 0,
      tokensOut: 0,
      useCase: 'classify-intent',
    });

    const payload = insertMock.mock.calls[0]![0];
    expect(payload.customer_id).toBeNull();
    expect(payload.conversation_id).toBeNull();
    expect(payload.cost_usd).toBe(0);
  });

  it('falha de INSERT (error) → warn logado, exceção NÃO propaga', async () => {
    insertMock.mockResolvedValue({ error: { message: 'db down' } });

    await expect(
      recordMessageCost({
        tenantId: 'tenant-3',
        model: 'gpt-4o-mini',
        tokensIn: 100,
        tokensOut: 50,
        useCase: 'agent_response',
      }),
    ).resolves.toBeUndefined();
  });

  it('exceção thrown pelo driver → warn logado, NÃO propaga', async () => {
    insertMock.mockRejectedValue(new Error('network'));

    await expect(
      recordMessageCost({
        tenantId: 'tenant-4',
        model: 'gpt-4o-mini',
        tokensIn: 100,
        tokensOut: 50,
        useCase: 'agent_response',
      }),
    ).resolves.toBeUndefined();
  });
});

// ─── Integração com LangGraphService.processMessage ──────────────────────────
// Mesmo padrão de langgraph.service.test.ts: vi.doMock('./agent.nodes')
// controla o fluxo do grafo; aqui mockamos o recorder para verificar que
// processMessage o chama com os IDs do estado.

describe('LangGraphService.processMessage → recordMessageCost (IA-34)', () => {
  const input = {
    tenantId: 'tenant-A',
    customerId: 'cust-X',
    conversationId: 'conv-Y',
    userMessage: 'Quero cancelar',
  };

  const nodeResults = {
    guardPassed: true,
    validationPassed: true,
    requiresHuman: false,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock('./cost-recorder', async () => {
      const actual = await vi.importActual<typeof import('./cost-recorder')>('./cost-recorder');
      return {
        ...actual,
        recordMessageCost: vi.fn().mockResolvedValue(undefined),
      };
    });
    vi.doMock('../../domain/agent/agent.nodes', () => ({
      nodeClassify:     async () => ({ intent: 'cancel_service' }),
      nodeGuardrails:   async () => ({ guardPassed: nodeResults.guardPassed }),
      nodeDecideSource: async () => ({ dataSource: 'supabase' }),
      nodeFetchContext: async () => ({ dbContext: 'dados-fake' }),
      nodeGenerate:     async () => ({ response: 'resposta-gerada', tokensUsed: 1234 }),
      nodeValidate:     async () => ({
        validationPassed: nodeResults.validationPassed,
        requiresHuman: nodeResults.requiresHuman,
      }),
      nodeEscalate: async () => ({ response: 'escalado', requiresHuman: true }),
      nodeBlock:    async () => ({ response: 'bloqueado', requiresHuman: true }),
      nodeGradeContext: async (state: any = { steps: [] }) => ({ steps: [...state.steps, 'grade_context'] }),
      nodeRewriteQuery: async (state: any = { steps: [] }) => ({ steps: [...state.steps, 'rewrite_query'] }),
      nodeSelfCheck:   async (state: any = { steps: [] }) => ({ steps: [...state.steps, 'self_check'] }),
      nodeSafetyVeto:  async (state: any = { steps: [] }) => ({ steps: [...state.steps, 'safety_veto'] }),
      setCreateToolsOverride: () => {},
    }));
  });

  // 30s: importar langgraph.service dinamicamente passa de 5s sob a suíte completa
  // (contenção de CPU) — em isolamento leva <2s. Mesmo padrão do server.test.ts.
  it('chama recordMessageCost com tenantId/customerId/conversationId do input + useCase agent_response', { timeout: 30_000 }, async () => {
    const { recordMessageCost: mockedRecorder } = await import('./cost-recorder');
    const { langGraphService } = await import('../../domain/agent/langgraph.service');
    await langGraphService.processMessage(input);

    // fire-and-forget: o caller não await; usamos microtask drain.
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    expect(mockedRecorder).toHaveBeenCalledTimes(1);
    const call = (mockedRecorder as any).mock.calls[0]![0];
    expect(call.tenantId).toBe('tenant-A');
    expect(call.customerId).toBe('cust-X');
    expect(call.conversationId).toBe('conv-Y');
    expect(call.useCase).toBe('agent_response');
    expect(call.tokensIn).toBeGreaterThanOrEqual(0);
    expect(call.tokensOut).toBeGreaterThanOrEqual(0);
    expect(['gpt-4o', 'gpt-4o-mini']).toContain(call.model);
  });
});
