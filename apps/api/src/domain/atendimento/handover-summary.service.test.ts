import { describe, it, expect } from 'vitest';
import { buildHandoverSummary, formatHandoverForTicket } from './handover-summary.service';
import type { AgentState } from '../agent/agent.state';

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    tenantId: 't1',
    customerId: 'c1',
    conversationId: 'conv-1',
    userMessage: 'Quero cancelar meu plano',
    steps: [],
    startedAt: new Date().toISOString(),
    tokensUsed: 0,
    toolsExecuted: [],
    retrievalAttempts: 0,
    regenerationAttempts: 0,
    ...overrides,
  };
}

describe('buildHandoverSummary (P1-04)', () => {
  it('usa escalationReason quando disponível', () => {
    const state = makeState({ escalationReason: 'cliente muito frustrado' });
    const summary = buildHandoverSummary(state);
    expect(summary.issue).toBe('cliente muito frustrado');
  });

  it('fallback para validationIssue quando não há escalationReason', () => {
    const state = makeState({ validationIssue: 'resposta fora do escopo' });
    const summary = buildHandoverSummary(state);
    expect(summary.issue).toBe('resposta fora do escopo');
  });

  it('urgência high é preservada', () => {
    const state = makeState({ urgency: 'high' });
    const summary = buildHandoverSummary(state);
    expect(summary.urgency).toBe('high');
  });

  it('urgência low quando não especificada', () => {
    const state = makeState({});
    const summary = buildHandoverSummary(state);
    expect(summary.urgency).toBe('low');
  });

  it('sugere retenção para intenção de cancelamento', () => {
    const state = makeState({ intent: 'cancel_service' });
    const summary = buildHandoverSummary(state);
    expect(summary.suggestedNextStep).toMatch(/reten/i);
  });

  it('sugere OS técnica para suporte técnico', () => {
    const state = makeState({ intent: 'support_technical' });
    const summary = buildHandoverSummary(state);
    expect(summary.suggestedNextStep).toMatch(/OS técnica/i);
  });

  it('sugere negociação para suporte de cobrança', () => {
    const state = makeState({ intent: 'support_billing' });
    const summary = buildHandoverSummary(state);
    expect(summary.suggestedNextStep).toMatch(/negociaç/i);
  });

  it('inclui tools usadas no contextSnippet quando há toolsExecuted', () => {
    const state = makeState({
      toolsExecuted: [{ name: 'check_invoice', args: {}, result: {} }],
    });
    const summary = buildHandoverSummary(state);
    expect(summary.contextSnippet).toContain('check_invoice');
  });

  it('contextSnippet sem tools quando toolsExecuted está vazio', () => {
    const state = makeState({ toolsExecuted: [] });
    const summary = buildHandoverSummary(state);
    expect(summary.contextSnippet).not.toContain('Tools usadas');
  });
});

describe('formatHandoverForTicket (P1-04)', () => {
  it('formata markdown com seções esperadas', () => {
    const state = makeState({ urgency: 'high', escalationReason: 'cliente reclamou do sinal' });
    const summary = buildHandoverSummary(state);
    const md = formatHandoverForTicket(summary);
    expect(md).toContain('## Resumo da IA para o Operador');
    expect(md).toContain('**Problema:**');
    expect(md).toContain('**Urgência:** high');
    expect(md).toContain('**Próximo passo sugerido:**');
  });
});
