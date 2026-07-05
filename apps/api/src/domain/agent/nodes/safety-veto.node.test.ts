import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeSafetyVeto } from './safety-veto.node';
import { initialState } from '../agent.state';

vi.mock('../../../infrastructure/guardrails/safety-classifier.service', () => ({
  classifyResponseSafety: vi.fn(),
  isSafetyClassifierEnabled: vi.fn(),
  SafetyCategory: {},
}));

describe('nodeSafetyVeto (IA-21)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it('flag off → short-circuit (sem chamar classificador) e adiciona step', async () => {
    const { isSafetyClassifierEnabled, classifyResponseSafety } = await import(
      '../../../infrastructure/guardrails/safety-classifier.service'
    );
    (isSafetyClassifierEnabled as any).mockReturnValue(false);
    const db = { recordSafetyVeto: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const node = makeNodeSafetyVeto({ db: db as any, logger: logger as any });
    const state = initialState({
      tenantId: 't1', customerId: 'c1', conversationId: 'conv1',
      userMessage: 'Oi',
    });
    state.response = 'qualquer resposta';

    const patch = await node(state);
    expect(patch.steps).toContain('safety_veto');
    expect(classifyResponseSafety).not.toHaveBeenCalled();
    expect(db.recordSafetyVeto).not.toHaveBeenCalled();
  });

  it('flag on + safe → passo OK sem gravar veto', async () => {
    const { isSafetyClassifierEnabled, classifyResponseSafety } = await import(
      '../../../infrastructure/guardrails/safety-classifier.service'
    );
    (isSafetyClassifierEnabled as any).mockReturnValue(true);
    (classifyResponseSafety as any).mockResolvedValue({ safe: true, categories: [] });
    const db = { recordSafetyVeto: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const node = makeNodeSafetyVeto({ db: db as any, logger: logger as any });
    const state = initialState({
      tenantId: 't1', customerId: 'c1', conversationId: 'conv1',
      userMessage: 'Oi',
    });
    state.response = 'resposta ok';
    state.ragContext = 'manual';

    const patch = await node(state);
    expect(patch.safetyVetoed).toBeUndefined();
    expect(db.recordSafetyVeto).not.toHaveBeenCalled();
  });

  it('flag on + !safe → marca veto, registra fila de revisão (fire-and-forget)', async () => {
    const { isSafetyClassifierEnabled, classifyResponseSafety } = await import(
      '../../../infrastructure/guardrails/safety-classifier.service'
    );
    (isSafetyClassifierEnabled as any).mockReturnValue(true);
    (classifyResponseSafety as any).mockResolvedValue({
      safe: false,
      categories: ['valor_ou_prazo_inventado', 'promessa_nao_autorizada'],
    });
    const db = { recordSafetyVeto: vi.fn().mockResolvedValue(undefined) };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const node = makeNodeSafetyVeto({ db: db as any, logger: logger as any });
    const state = initialState({
      tenantId: 't1', customerId: 'c1', conversationId: 'conv1',
      userMessage: 'posso agendar?',
    });
    state.response = 'Confirmo sua visita amanhã às 14h.';

    const patch = await node(state);
    expect(patch.safetyVetoed).toBe(true);
    expect(patch.safetyCategories).toEqual(['valor_ou_prazo_inventado', 'promessa_nao_autorizada']);
    // fire-and-forget: chamada já disparada (mas o await é no caller — aqui verificamos o sync)
    expect(db.recordSafetyVeto).toHaveBeenCalledWith({
      tenant_id: 't1',
      conversation_id: 'conv1',
      response_text: 'Confirmo sua visita amanhã às 14h.',
      categories: ['valor_ou_prazo_inventado', 'promessa_nao_autorizada'],
    });
  });

  it('resposta vazia → no-op (mesmo com flag on)', async () => {
    const { isSafetyClassifierEnabled, classifyResponseSafety } = await import(
      '../../../infrastructure/guardrails/safety-classifier.service'
    );
    (isSafetyClassifierEnabled as any).mockReturnValue(true);
    const db = { recordSafetyVeto: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const node = makeNodeSafetyVeto({ db: db as any, logger: logger as any });
    const state = initialState({
      tenantId: 't1', customerId: 'c1', conversationId: 'conv1',
      userMessage: 'Oi',
    });
    state.response = '';

    const patch = await node(state);
    expect(patch.steps).toContain('safety_veto');
    expect(classifyResponseSafety).not.toHaveBeenCalled();
  });
});
