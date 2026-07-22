import { describe, it, expect, vi } from 'vitest';
import { evaluateRegression, detectLoop, handleRegression, ConversationState, RegressionPorts, DEFAULT_REGRESSION_CONFIG } from './agent-regression.service';

function makeState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    conversationId: 'conv1', tenantId: 't1', turnCount: 2,
    sentimentScores: [0.1, 0.2], lastClassification: 'active', hasLoop: false,
    ...overrides,
  };
}

describe('agent-regression.service', () => {
  describe('detectLoop', () => {
    it('detecta loop quando mesma intenção repete', () => {
      expect(detectLoop(['billing', 'billing', 'billing', 'billing'], 4, 0.8)).toBe(true);
    });

    it('não detecta loop com variação', () => {
      expect(detectLoop(['billing', 'support', 'billing', 'info'], 4, 0.8)).toBe(false);
    });

    it('retorna false com poucos intents', () => {
      expect(detectLoop(['billing'], 4, 0.8)).toBe(false);
    });
  });

  describe('evaluateRegression', () => {
    it('escalate_turns quando excede max turnos', () => {
      const state = makeState({ turnCount: 6 });
      expect(evaluateRegression(state, [])).toBe('escalate_turns');
    });

    it('escalate_sentiment quando sentimento negativo', () => {
      const state = makeState({ sentimentScores: [-0.5, -0.4, -0.3] });
      expect(evaluateRegression(state, [])).toBe('escalate_sentiment');
    });

    it('escalate_loop quando detecta loop de intenções', () => {
      const state = makeState();
      const intents = ['reset', 'reset', 'reset', 'reset'];
      expect(evaluateRegression(state, intents)).toBe('escalate_loop');
    });

    it('continue quando tudo ok', () => {
      expect(evaluateRegression(makeState(), ['billing', 'support'])).toBe('continue');
    });

    it('continue quando já escalado', () => {
      const state = makeState({ lastClassification: 'escalated', turnCount: 10 });
      expect(evaluateRegression(state, [])).toBe('continue');
    });

    it('continue quando resolvido', () => {
      const state = makeState({ lastClassification: 'resolved' });
      expect(evaluateRegression(state, [])).toBe('continue');
    });
  });

  describe('handleRegression', () => {
    it('chama escalateToHuman quando decision != continue', async () => {
      const ports: RegressionPorts = {
        escalateToHuman: vi.fn().mockResolvedValue(undefined),
        logRegression: vi.fn().mockResolvedValue(undefined),
      };
      const state = makeState({ turnCount: 6 });
      const decision = await handleRegression(state, [], ports);
      expect(decision).toBe('escalate_turns');
      expect(ports.escalateToHuman).toHaveBeenCalledOnce();
      expect(ports.logRegression).toHaveBeenCalledOnce();
    });

    it('não escala quando continue', async () => {
      const ports: RegressionPorts = {
        escalateToHuman: vi.fn().mockResolvedValue(undefined),
        logRegression: vi.fn().mockResolvedValue(undefined),
      };
      const decision = await handleRegression(makeState(), ['a', 'b'], ports);
      expect(decision).toBe('continue');
      expect(ports.escalateToHuman).not.toHaveBeenCalled();
    });
  });
});
