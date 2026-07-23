import { describe, it, expect } from 'vitest';
import {
  computeOsDurations,
  aggregateKmByDay,
  averageDurationByType,
  estimateOsCost,
  type OsTimelineEvent,
} from './field-reports.service';

describe('field-reports.service', () => {
  describe('computeOsDurations', () => {
    it('calcula deslocamento, execução e SLA de um fluxo completo', () => {
      const events: OsTimelineEvent[] = [
        { event: 'criada', at: '2026-07-22T08:00:00Z' },
        { event: 'a_caminho', at: '2026-07-22T09:00:00Z' },
        { event: 'chegou', at: '2026-07-22T09:30:00Z' },   // 30 min deslocamento
        { event: 'iniciada', at: '2026-07-22T09:35:00Z' },
        { event: 'concluida', at: '2026-07-22T10:35:00Z' }, // 60 min execução
      ];
      const d = computeOsDurations(events);
      expect(d.deslocamentoMin).toBe(30);
      expect(d.execucaoMin).toBe(60);
      expect(d.pausaMin).toBe(0);
      expect(d.slaMin).toBe(155); // 08:00 → 10:35
    });

    it('desconta pausas do tempo de execução', () => {
      const events: OsTimelineEvent[] = [
        { event: 'iniciada', at: '2026-07-22T09:00:00Z' },
        { event: 'pausada', at: '2026-07-22T09:20:00Z' },
        { event: 'retomada', at: '2026-07-22T09:35:00Z' }, // 15 min de pausa
        { event: 'concluida', at: '2026-07-22T10:00:00Z' }, // 60 min brutos - 15 pausa = 45
      ];
      const d = computeOsDurations(events);
      expect(d.pausaMin).toBe(15);
      expect(d.execucaoMin).toBe(45);
    });

    it('retorna null para etapas ausentes', () => {
      const d = computeOsDurations([{ event: 'criada', at: '2026-07-22T08:00:00Z' }]);
      expect(d.deslocamentoMin).toBeNull();
      expect(d.execucaoMin).toBeNull();
      expect(d.slaMin).toBeNull();
    });

    it('ordena eventos fora de ordem antes de calcular', () => {
      const events: OsTimelineEvent[] = [
        { event: 'chegou', at: '2026-07-22T09:30:00Z' },
        { event: 'a_caminho', at: '2026-07-22T09:00:00Z' },
      ];
      expect(computeOsDurations(events).deslocamentoMin).toBe(30);
    });

    it('execução nunca fica negativa mesmo com pausa maior que a janela', () => {
      const events: OsTimelineEvent[] = [
        { event: 'iniciada', at: '2026-07-22T09:00:00Z' },
        { event: 'pausada', at: '2026-07-22T09:01:00Z' },
        { event: 'retomada', at: '2026-07-22T11:00:00Z' },
        { event: 'concluida', at: '2026-07-22T09:30:00Z' },
      ];
      expect(computeOsDurations(events).execucaoMin).toBe(0);
    });
  });

  describe('aggregateKmByDay', () => {
    it('soma km do mesmo dia e ordena', () => {
      const r = aggregateKmByDay([
        { day: '2026-07-22', km: 10 },
        { day: '2026-07-21', km: 5 },
        { day: '2026-07-22', km: 7.5 },
      ]);
      expect(r).toEqual([
        { day: '2026-07-21', km: 5 },
        { day: '2026-07-22', km: 17.5 },
      ]);
    });

    it('lista vazia → vazio', () => {
      expect(aggregateKmByDay([])).toEqual([]);
    });
  });

  describe('averageDurationByType', () => {
    it('média por tipo, ordenada da maior para a menor', () => {
      const r = averageDurationByType([
        { type: 'instalacao', execucaoMin: 60 },
        { type: 'instalacao', execucaoMin: 80 },
        { type: 'reparo', execucaoMin: 30 },
      ]);
      expect(r[0]).toEqual({ type: 'instalacao', avgMin: 70, count: 2 });
      expect(r[1]).toEqual({ type: 'reparo', avgMin: 30, count: 1 });
    });
  });

  describe('estimateOsCost', () => {
    it('combina custo por km e por hora técnica', () => {
      // 10km × R$2 + 1.5h × R$40 = 20 + 60 = 80
      expect(estimateOsCost(10, 90, { perKmBRL: 2, perHourBRL: 40 })).toBe(80);
    });

    it('zero quando não há km nem tempo', () => {
      expect(estimateOsCost(0, 0, { perKmBRL: 2, perHourBRL: 40 })).toBe(0);
    });
  });
});
