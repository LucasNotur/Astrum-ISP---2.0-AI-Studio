import { describe, it, expect } from 'vitest';
import { computeStats, buildTrainingPair, FeedbackEntry } from './feedback-loop.service';

function makeEntry(rating: 'good' | 'bad' | 'edited', tags: string[] = []): FeedbackEntry {
  return {
    id: '1', tenantId: 't1', conversationId: 'c1', messageId: 'm1',
    aiResponse: 'Resposta da IA', operatorId: 'op1', rating, tags,
    createdAt: '2026-07-22', correctedResponse: rating === 'edited' ? 'Resposta corrigida' : undefined,
  };
}

describe('feedback-loop.service', () => {
  describe('computeStats', () => {
    it('calcula approval rate (good + edited) / total', () => {
      const entries = [makeEntry('good'), makeEntry('good'), makeEntry('edited'), makeEntry('bad')];
      const stats = computeStats(entries);
      expect(stats.totalFeedback).toBe(4);
      expect(stats.goodCount).toBe(2);
      expect(stats.editedCount).toBe(1);
      expect(stats.badCount).toBe(1);
      expect(stats.approvalRate).toBe(75);
    });

    it('top issues ordenadas por frequência', () => {
      const entries = [
        makeEntry('bad', ['tom_formal', 'impreciso']),
        makeEntry('bad', ['tom_formal']),
        makeEntry('bad', ['impreciso', 'lento']),
      ];
      const stats = computeStats(entries);
      expect(stats.topIssues[0].tag).toBe('tom_formal');
      expect(stats.topIssues[0].count).toBe(2);
    });

    it('retorna zero para lista vazia', () => {
      const stats = computeStats([]);
      expect(stats.approvalRate).toBe(0);
      expect(stats.totalFeedback).toBe(0);
    });
  });

  describe('buildTrainingPair', () => {
    it('usa resposta original para rating good', () => {
      const pair = buildTrainingPair(makeEntry('good'), 'Minha internet caiu');
      expect(pair).toEqual({ input: 'Minha internet caiu', output: 'Resposta da IA' });
    });

    it('usa resposta corrigida para rating edited', () => {
      const pair = buildTrainingPair(makeEntry('edited'), 'Minha internet caiu');
      expect(pair).toEqual({ input: 'Minha internet caiu', output: 'Resposta corrigida' });
    });

    it('retorna null para rating bad', () => {
      expect(buildTrainingPair(makeEntry('bad'), 'Minha internet caiu')).toBeNull();
    });
  });
});
