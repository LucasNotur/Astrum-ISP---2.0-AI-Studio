import { describe, it, expect } from 'vitest';
import {
  detectConfirmationSignal,
  hasCustomerConfirmation,
  evaluateCandidate,
  rankCandidates,
  type ConversationSignals,
} from './kb-candidate-scoring.service';

const NOW = '2026-07-23T12:00:00Z';
function daysAgo(d: number): string {
  return new Date(new Date(NOW).getTime() - d * 86400000).toISOString();
}

function signals(over: Partial<ConversationSignals> = {}): ConversationSignals {
  return {
    resolvedAt: daysAgo(10), messageCount: 6,
    reopened: false, explicitConfirmation: false, csatScore: null,
    ...over,
  };
}

describe('kb-candidate-scoring.service', () => {
  describe('detectConfirmationSignal', () => {
    it('detecta emojis de confirmação', () => {
      expect(detectConfirmationSignal('👍')).toBe(true);
      expect(detectConfirmationSignal('valeu ✅')).toBe(true);
    });

    it('detecta frases PT-BR', () => {
      expect(detectConfirmationSignal('resolveu sim, obrigado')).toBe(true);
      expect(detectConfirmationSignal('Funcionou!')).toBe(true);
      expect(detectConfirmationSignal('deu certo aqui')).toBe(true);
      expect(detectConfirmationSignal('a internet voltou')).toBe(true);
    });

    it('funciona com acentuação (normaliza)', () => {
      expect(detectConfirmationSignal('já está funcionando')).toBe(true);
      expect(detectConfirmationSignal('normalizou après o reset')).toBe(true);
    });

    it('não confunde texto neutro', () => {
      expect(detectConfirmationSignal('ainda está sem internet')).toBe(false);
      expect(detectConfirmationSignal('')).toBe(false);
      expect(detectConfirmationSignal(null)).toBe(false);
    });

    it('negação derruba o sinal (não gera artigo de conversa que não resolveu)', () => {
      expect(detectConfirmationSignal('não resolveu nada')).toBe(false);
      expect(detectConfirmationSignal('não funcionou')).toBe(false);
      expect(detectConfirmationSignal('continua sem sinal, não voltou')).toBe(false);
      expect(detectConfirmationSignal('piorou depois do reset')).toBe(false);
      expect(detectConfirmationSignal('nunca funcionou direito')).toBe(false);
    });
  });

  describe('hasCustomerConfirmation', () => {
    it('só conta mensagem do cliente', () => {
      expect(hasCustomerConfirmation([
        { role: 'assistant', content: 'resolveu para você?' },
      ])).toBe(false);

      expect(hasCustomerConfirmation([
        { role: 'assistant', content: 'resolveu para você?' },
        { role: 'user', content: 'sim, funcionou!' },
      ])).toBe(true);
    });
  });

  describe('evaluateCandidate', () => {
    it('elegível pela quarentena padrão (7d) sem confirmação', () => {
      const e = evaluateCandidate(signals({ resolvedAt: daysAgo(8) }), { now: NOW });
      expect(e.eligible).toBe(true);
      expect(e.quarantineDaysRequired).toBe(7);
    });

    it('ainda em quarentena aos 3 dias sem confirmação', () => {
      const e = evaluateCandidate(signals({ resolvedAt: daysAgo(3) }), { now: NOW });
      expect(e.eligible).toBe(false);
      expect(e.reason).toContain('quarentena');
    });

    it('confirmação encurta a quarentena para 1 dia', () => {
      const e = evaluateCandidate(
        signals({ resolvedAt: daysAgo(2), explicitConfirmation: true }), { now: NOW });
      expect(e.eligible).toBe(true);
      expect(e.quarantineDaysRequired).toBe(1);
      expect(e.reason).toContain('confirmou');
    });

    it('conversa reaberta é desqualificada', () => {
      const e = evaluateCandidate(signals({ reopened: true }), { now: NOW });
      expect(e.eligible).toBe(false);
      expect(e.reason).toContain('reabriu');
    });

    it('conversa curta é desqualificada', () => {
      const e = evaluateCandidate(signals({ messageCount: 2 }), { now: NOW });
      expect(e.eligible).toBe(false);
      expect(e.reason).toContain('curta');
    });

    it('confirmação aumenta a prioridade', () => {
      const sem = evaluateCandidate(signals(), { now: NOW });
      const com = evaluateCandidate(signals({ explicitConfirmation: true }), { now: NOW });
      expect(com.priority).toBeGreaterThan(sem.priority);
    });

    it('CSAT alto sobe e CSAT baixo derruba a prioridade', () => {
      const alto = evaluateCandidate(signals({ csatScore: 5 }), { now: NOW });
      const baixo = evaluateCandidate(signals({ csatScore: 1 }), { now: NOW });
      expect(alto.priority).toBeGreaterThan(baixo.priority);
    });

    it('prioridade fica entre 0 e 100', () => {
      const max = evaluateCandidate(
        signals({ explicitConfirmation: true, csatScore: 5, messageCount: 500 }), { now: NOW });
      expect(max.priority).toBeLessThanOrEqual(100);
      expect(max.priority).toBeGreaterThanOrEqual(0);
    });
  });

  describe('rankCandidates', () => {
    it('filtra inelegíveis e ordena por prioridade', () => {
      const ranked = rankCandidates([
        { item: 'sem-confirmacao', signals: signals() },
        { item: 'confirmada', signals: signals({ explicitConfirmation: true, csatScore: 5 }) },
        { item: 'em-quarentena', signals: signals({ resolvedAt: daysAgo(1) }) },
        { item: 'reaberta', signals: signals({ reopened: true }) },
      ], { now: NOW });

      expect(ranked.map((r) => r.item)).toEqual(['confirmada', 'sem-confirmacao']);
      expect(ranked[0]!.eligibility.priority).toBeGreaterThan(ranked[1]!.eligibility.priority);
    });

    it('lista vazia → vazio', () => {
      expect(rankCandidates([], { now: NOW })).toEqual([]);
    });
  });
});
