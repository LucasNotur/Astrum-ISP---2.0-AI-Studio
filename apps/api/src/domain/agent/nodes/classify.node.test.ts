import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClassifyIntent } = vi.hoisted(() => ({
  mockClassifyIntent: vi.fn(),
}));

vi.mock('../../../infrastructure/ai/vercel-ai.service', () => ({
  vercelAIService: { classifyIntent: mockClassifyIntent },
}));

import { nodeClassify } from './classify.node';
import { initialState } from '../agent.state';

function makeState(userMessage = 'Minha internet está lenta') {
  return initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage }) as any;
}

describe('nodeClassify', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('mapeia retorno do service para o estado do agente', async () => {
    mockClassifyIntent.mockResolvedValue({
      intent: 'support_technical',
      urgency: 'high',
      sentiment: 'frustrated',
    });

    const r = await nodeClassify(makeState('Minha internet caiu há 3 horas!'));
    expect(r.intent).toBe('support_technical');
    expect(r.urgency).toBe('high');
    expect(r.sentiment).toBe('frustrated');
    expect(r.steps).toContain('classify');
  });

  it('passa userMessage e tenantId corretamente para o service', async () => {
    mockClassifyIntent.mockResolvedValue({ intent: 'other', urgency: 'low', sentiment: 'neutral' });

    const state = initialState({ tenantId: 'tenant-ABC', customerId: 'c1', conversationId: 'c1', userMessage: 'Olá' }) as any;
    await nodeClassify(state);

    expect(mockClassifyIntent).toHaveBeenCalledWith(
      'Olá',
      '',
      'tenant-ABC',
    );
  });

  it('intent support_billing retornado corretamente', async () => {
    mockClassifyIntent.mockResolvedValue({ intent: 'support_billing', urgency: 'normal', sentiment: 'neutral' });

    const r = await nodeClassify(makeState('Preciso da 2ª via da minha fatura'));
    expect(r.intent).toBe('support_billing');
  });
});
