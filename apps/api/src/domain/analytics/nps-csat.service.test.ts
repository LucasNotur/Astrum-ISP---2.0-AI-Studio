import { describe, it, expect } from 'vitest';
import {
  calculateNps,
  calculateCsat,
  buildSatisfactionReport,
  SurveyResponse,
  NpsCsatPorts,
} from './nps-csat.service';

function r(score: number, type: 'nps' | 'csat' = 'nps', channel = 'whatsapp', operatorId = 'op1'): SurveyResponse {
  return { customerId: `c${score}`, score, type, createdAt: '2026-07-15', channel, operatorId };
}

describe('nps-csat.service', () => {
  describe('calculateNps', () => {
    it('calcula NPS corretamente (promoters - detractors) / total * 100', () => {
      const responses = [r(10), r(9), r(8), r(7), r(3), r(2)];
      const result = calculateNps(responses);
      expect(result.promoters).toBe(2);
      expect(result.passives).toBe(2);
      expect(result.detractors).toBe(2);
      expect(result.score).toBe(0);
    });

    it('NPS 100 quando todos promotores', () => {
      const responses = [r(10), r(9), r(10)];
      expect(calculateNps(responses).score).toBe(100);
    });

    it('NPS -100 quando todos detratores', () => {
      const responses = [r(1), r(3), r(5)];
      expect(calculateNps(responses).score).toBe(-100);
    });

    it('retorna zero para lista vazia', () => {
      expect(calculateNps([]).score).toBe(0);
      expect(calculateNps([]).total).toBe(0);
    });

    it('ignora respostas CSAT', () => {
      const responses = [r(10, 'nps'), r(5, 'csat')];
      const result = calculateNps(responses);
      expect(result.total).toBe(1);
    });
  });

  describe('calculateCsat', () => {
    it('calcula percentual de satisfeitos (score >= 4)', () => {
      const responses = [r(5, 'csat'), r(4, 'csat'), r(3, 'csat'), r(2, 'csat')];
      const result = calculateCsat(responses);
      expect(result.satisfied).toBe(2);
      expect(result.total).toBe(4);
      expect(result.score).toBe(50);
    });

    it('CSAT 100% quando todos satisfeitos', () => {
      const responses = [r(5, 'csat'), r(4, 'csat')];
      expect(calculateCsat(responses).score).toBe(100);
    });

    it('retorna zero para lista vazia', () => {
      expect(calculateCsat([]).score).toBe(0);
    });
  });

  describe('buildSatisfactionReport', () => {
    it('gera relatório completo com breakdown por canal e operador', async () => {
      const responses: SurveyResponse[] = [
        { customerId: 'c1', score: 10, type: 'nps', createdAt: '2026-06-15', channel: 'whatsapp', operatorId: 'op1' },
        { customerId: 'c2', score: 5, type: 'csat', createdAt: '2026-06-20', channel: 'whatsapp', operatorId: 'op1' },
        { customerId: 'c3', score: 9, type: 'nps', createdAt: '2026-07-10', channel: 'portal', operatorId: 'op2' },
        { customerId: 'c4', score: 4, type: 'csat', createdAt: '2026-07-12', channel: 'portal', operatorId: 'op2' },
      ];
      const ports: NpsCsatPorts = { getResponses: async () => responses };
      const report = await buildSatisfactionReport('t1', '2026-06-01', '2026-07-31', ports);

      expect(report.tenantId).toBe('t1');
      expect(report.nps.total).toBe(2);
      expect(report.csat.total).toBe(2);
      expect(report.byChannel).toHaveProperty('whatsapp');
      expect(report.byChannel).toHaveProperty('portal');
      expect(report.byOperator).toHaveProperty('op1');
      expect(report.byOperator).toHaveProperty('op2');
      expect(report.trend).toHaveLength(2);
      expect(report.trend[0].month).toBe('2026-06');
      expect(report.trend[1].month).toBe('2026-07');
    });

    it('retorna report vazio sem respostas', async () => {
      const ports: NpsCsatPorts = { getResponses: async () => [] };
      const report = await buildSatisfactionReport('t1', '2026-01-01', '2026-12-31', ports);
      expect(report.nps.total).toBe(0);
      expect(report.csat.total).toBe(0);
      expect(report.trend).toHaveLength(0);
    });
  });
});
