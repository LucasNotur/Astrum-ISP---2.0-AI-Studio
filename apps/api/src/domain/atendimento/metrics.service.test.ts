import { describe, it, expect } from 'vitest';
import { aggregateTimeQuality, parsePeriodDays, type DailyTimeRow } from './metrics.service';

function row(date: string, tma: number, tmr: number, ai = tma, human = tma): DailyTimeRow {
  return { date, tma_total_ms: tma, tma_ai_ms: ai, tma_human_ms: human, tmr_total_ms: tmr };
}

describe('parsePeriodDays', () => {
  it('"7d"/"30d" → número; inválido/ausente → 7; cap 365; min 1', () => {
    expect(parsePeriodDays('7d')).toBe(7);
    expect(parsePeriodDays('30d')).toBe(30);
    expect(parsePeriodDays('abc')).toBe(7);
    expect(parsePeriodDays(undefined)).toBe(7);
    expect(parsePeriodDays('999d')).toBe(365);
    expect(parsePeriodDays('0d')).toBe(1);
  });
});

describe('aggregateTimeQuality', () => {
  it('vazio → tudo zero', () => {
    expect(aggregateTimeQuality([])).toEqual({ tma: 0, tma_trend: 0, tmr: 0, tmr_trend: 0, history: [] });
  });

  it('média de TMA/TMR + série de history com week/tma_ai/tma_human', () => {
    const rows = [row('2026-08-01', 1000, 500, 800, 1200), row('2026-08-02', 3000, 1500, 2000, 4000)];
    const out = aggregateTimeQuality(rows);
    expect(out.tma).toBe(2000); // (1000+3000)/2
    expect(out.tmr).toBe(1000); // (500+1500)/2
    expect(out.history).toEqual([
      { week: '2026-08-01', tma_ai: 800, tma_human: 1200 },
      { week: '2026-08-02', tma_ai: 2000, tma_human: 4000 },
    ]);
  });

  it('tendência = metade recente vs metade antiga (queda = negativo = melhora)', () => {
    // antiga (média 4000) → recente (média 2000): -50%
    const rows = [
      row('2026-08-01', 4000, 4000),
      row('2026-08-02', 4000, 4000),
      row('2026-08-03', 2000, 2000),
      row('2026-08-04', 2000, 2000),
    ];
    const out = aggregateTimeQuality(rows);
    expect(out.tma_trend).toBe(-50);
    expect(out.tmr_trend).toBe(-50);
  });

  it('um único ponto → sem tendência (0)', () => {
    const out = aggregateTimeQuality([row('2026-08-01', 1000, 500)]);
    expect(out.tma_trend).toBe(0);
    expect(out.tmr_trend).toBe(0);
    expect(out.tma).toBe(1000);
  });
});
