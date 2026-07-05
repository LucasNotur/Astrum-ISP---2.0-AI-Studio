import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeEscalate } from './escalate.node';
import { initialState } from '../agent.state';

const mockCreateTicket = vi.fn().mockResolvedValue(undefined);
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const nodeEscalate = makeNodeEscalate({ db: { fetchCustomer: vi.fn(), createTicket: mockCreateTicket }, logger });

function makeState(overrides: Record<string, any> = {}) {
  return {
    ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage: 'ajuda' }),
    ...overrides,
  } as any;
}

describe('nodeEscalate', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('cria ticket com tenant e customerId corretos', async () => {
    await nodeEscalate(makeState({ validationIssue: 'Alucinação detectada' }));
    expect(mockCreateTicket).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 't1', customer_id: 'c1' })
    );
  });

  it('retorna requiresHuman=true e resposta de escalação', async () => {
    const r = await nodeEscalate(makeState());
    expect(r.requiresHuman).toBe(true);
    expect(typeof r.response).toBe('string');
    expect((r.response as string).length).toBeGreaterThan(10);
  });

  it('usa validationIssue no título do ticket', async () => {
    await nodeEscalate(makeState({ validationIssue: 'Resposta fora do contexto ISP' }));
    const call = mockCreateTicket.mock.calls[0]?.[0];
    expect(call?.title).toContain('Resposta fora do contexto ISP');
  });

  it('usa escalationReason quando validationIssue é ausente', async () => {
    await nodeEscalate(makeState({ escalationReason: 'Cliente solicitou humano' }));
    const call = mockCreateTicket.mock.calls[0]?.[0];
    expect(call?.title).toContain('Cliente solicitou humano');
  });

  it('urgência high → prioridade urgent', async () => {
    await nodeEscalate(makeState({ urgency: 'high' }));
    const call = mockCreateTicket.mock.calls[0]?.[0];
    expect(call?.priority).toBe('urgent');
  });

  it('urgência normal → prioridade high', async () => {
    await nodeEscalate(makeState({ urgency: 'normal' }));
    const call = mockCreateTicket.mock.calls[0]?.[0];
    expect(call?.priority).toBe('high');
  });

  it('adiciona "escalate" ao array steps', async () => {
    const r = await nodeEscalate(makeState());
    expect(r.steps).toContain('escalate');
  });
});
