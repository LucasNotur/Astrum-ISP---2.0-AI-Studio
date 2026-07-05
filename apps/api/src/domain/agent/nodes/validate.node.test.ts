import { describe, it, expect } from 'vitest';
import { nodeValidate } from './validate.node';
import { initialState } from '../agent.state';

function makeState(response: string | undefined, intent = 'support_technical') {
  return {
    ...initialState({ tenantId: 't1', customerId: 'c1', conversationId: 'conv1', userMessage: 'teste' }),
    intent,
    response,
  } as any;
}

describe('nodeValidate', () => {
  it('resposta válida → validationPassed=true', async () => {
    const r = await nodeValidate(makeState('Sua internet está com problema de sinal na OLT. Reinicie o roteador e aguarde 2 minutos.'));
    expect(r.validationPassed).toBe(true);
    expect(r.validationIssue).toBeUndefined();
    expect(r.steps).toContain('validate');
  });

  it('resposta vazia → validationPassed=false, issue=vazia', async () => {
    const r = await nodeValidate(makeState(undefined));
    expect(r.validationPassed).toBe(false);
    expect(r.validationIssue).toMatch(/vaz/i);
  });

  it('resposta muito curta (<10 chars) → validationPassed=false', async () => {
    const r = await nodeValidate(makeState('Ok'));
    expect(r.validationPassed).toBe(false);
  });

  it('alucinação "como IA da OpenAI" → validationPassed=false', async () => {
    const r = await nodeValidate(makeState('Como IA da OpenAI não tenho acesso a informações de rede'));
    expect(r.validationPassed).toBe(false);
    expect(r.validationIssue).toMatch(/alucin/i);
  });

  it('alucinação "como modelo de linguagem" → validationPassed=false', async () => {
    const r = await nodeValidate(makeState('Como modelo de linguagem não posso ajudar com isso.'));
    expect(r.validationPassed).toBe(false);
  });

  it('resposta de suporte com termos ISP → passa', async () => {
    const r = await nodeValidate(makeState('Seu plano está ativo e o sinal da fibra está OK. Verifique o roteador.'));
    expect(r.validationPassed).toBe(true);
  });

  it('resposta off-topic para intent técnico → validationPassed=false', async () => {
    // Resposta longa sem nenhuma palavra ISP para intent técnico
    const longOffTopic = 'Este é um bolo de chocolate muito delicioso que você pode fazer em casa com ingredientes simples';
    const r = await nodeValidate(makeState(longOffTopic, 'support_technical'));
    expect(r.validationPassed).toBe(false);
    expect(r.validationIssue).toMatch(/contexto/i);
  });

  it('steps inclui "validate"', async () => {
    const r = await nodeValidate(makeState('Sua fatura venceu. Acesse o app para pagar.', 'support_billing'));
    expect(r.steps).toContain('validate');
  });
});
