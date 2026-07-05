import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock('../../../infrastructure/database/supabase.client', () => ({
  supabase: {
    from: vi.fn(() => ({ insert: mockInsert })),
  },
}));

import { nodeEscalate } from './escalate.node';
import { initialState } from '../agent.state';

function makeState(overrides: Record<string, any> = {}) {
  return {
    ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage: 'ajuda' }),
    ...overrides,
  } as any;
}

describe('nodeEscalate', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('cria ticket no Supabase com tenant e customerId corretos', async () => {
    await nodeEscalate(makeState({ validationIssue: 'Alucinação detectada' }));
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 't1', customer_id: 'c1' })
    );
  });

  it('retorna requiresHuman=true e resposta de escalação', async () => {
    const r = await nodeEscalate(makeState());
    expect(r.requiresHuman).toBe(true);
    expect(typeof r.response).toBe('string');
    expect((r.response as string).length).toBeGreaterThan(10);
  });

  it('usa validationIssue como razão quando disponível', async () => {
    await nodeEscalate(makeState({ validationIssue: 'Resposta fora do contexto ISP' }));
    const insertCall = mockInsert.mock.calls[0]?.[0];
    expect(insertCall?.title).toContain('Resposta fora do contexto ISP');
  });

  it('usa escalationReason quando validationIssue é ausente', async () => {
    await nodeEscalate(makeState({ escalationReason: 'Cliente solicitou humano' }));
    const insertCall = mockInsert.mock.calls[0]?.[0];
    expect(insertCall?.title).toContain('Cliente solicitou humano');
  });

  it('urgência high → prioridade urgent no ticket', async () => {
    await nodeEscalate(makeState({ urgency: 'high' }));
    const insertCall = mockInsert.mock.calls[0]?.[0];
    expect(insertCall?.priority).toBe('urgent');
  });

  it('urgência normal → prioridade high no ticket', async () => {
    await nodeEscalate(makeState({ urgency: 'normal' }));
    const insertCall = mockInsert.mock.calls[0]?.[0];
    expect(insertCall?.priority).toBe('high');
  });

  it('adiciona "escalate" ao array steps', async () => {
    const r = await nodeEscalate(makeState());
    expect(r.steps).toContain('escalate');
  });
});
