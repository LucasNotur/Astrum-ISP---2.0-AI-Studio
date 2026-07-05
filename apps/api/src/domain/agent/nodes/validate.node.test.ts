import { describe, it, expect, vi } from 'vitest';
import { makeNodeValidate } from './validate.node';
import { initialState } from '../agent.state';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const nodeValidate = makeNodeValidate(logger);

function makeState(overrides: Record<string, any> = {}) {
  return {
    ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage: 'ok' }),
    ...overrides,
  } as any;
}

describe('nodeValidate', () => {
  it('resposta válida passa', async () => {
    const r = await nodeValidate(makeState({ response: 'Reinicie o roteador e aguarde 2 minutos.' }));
    expect(r.validationPassed).toBe(true);
    expect(r.validationIssue).toBeUndefined();
    expect(r.steps).toContain('validate');
  });

  it('resposta undefined → validationPassed=false', async () => {
    const r = await nodeValidate(makeState({ response: undefined }));
    expect(r.validationPassed).toBe(false);
    expect(r.validationIssue).toBe('Resposta vazia gerada');
  });

  it('resposta muito curta → validationPassed=false', async () => {
    const r = await nodeValidate(makeState({ response: 'ok' }));
    expect(r.validationPassed).toBe(false);
    expect(r.validationIssue).toBe('Resposta vazia');
  });

  it('alucinação OpenAI detectada → bloqueada', async () => {
    const r = await nodeValidate(makeState({ response: 'Como IA da OpenAI não tenho acesso a esse dado.' }));
    expect(r.validationPassed).toBe(false);
    expect(r.validationIssue).toBe('Alucinação detectada');
  });

  it('alucinação "como modelo de linguagem" detectada', async () => {
    const r = await nodeValidate(makeState({ response: 'Como modelo de linguagem, não posso verificar sua conta.' }));
    expect(r.validationPassed).toBe(false);
    expect(r.validationIssue).toBe('Alucinação detectada');
  });

  it('resposta off-topic para intent técnica → bloqueada', async () => {
    const r = await nodeValidate(makeState({
      response: 'Você pode experimentar novos sabores de sorvete na loja do shopping center mais próximo.',
      intent: 'support_technical',
    }));
    expect(r.validationPassed).toBe(false);
    expect(r.validationIssue).toBe('Resposta fora do contexto ISP');
  });

  it('intent conversacional com resposta sem palavras ISP é válida', async () => {
    const r = await nodeValidate(makeState({
      response: 'Olá! Como posso ajudar você hoje com nosso serviço?',
      intent: 'other',
    }));
    expect(r.validationPassed).toBe(true);
  });

  it('resposta on-topic para billing passa', async () => {
    const r = await nodeValidate(makeState({
      response: 'Sua fatura vence no dia 10. Você pode pagar pelo boleto ou cartão.',
      intent: 'support_billing',
    }));
    expect(r.validationPassed).toBe(true);
  });
});
