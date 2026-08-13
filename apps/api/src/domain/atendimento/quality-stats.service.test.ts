import { describe, it, expect } from 'vitest';
import { computeQualityLiveStats, pickTopAgentId } from './quality-stats.service';

const base = {
  openTickets: 0,
  total24h: 0,
  escalated24h: 0,
  avgResponseMs: null as number | null,
  avgCsatWeek: null as number | null,
  topEscalatingAgent: null as string | null,
};

describe('computeQualityLiveStats', () => {
  it('devolve defaults seguros quando não há dados', () => {
    const s = computeQualityLiveStats(base);
    expect(s).toEqual({
      open_tickets: 0,
      resolved_last_24h: 0,
      escalation_rate: 0,
      avg_response_time_ms: 0,
      avg_csat_week: 0,
      top_escalating_agent: 'N/A',
    });
  });

  it('% s/ escalation = (total - escalados) / total', () => {
    const s = computeQualityLiveStats({ ...base, total24h: 4, escalated24h: 1 });
    expect(s.resolved_last_24h).toBe(75);
    expect(s.escalation_rate).toBe(25);
  });

  it('arredonda a 1 casa', () => {
    const s = computeQualityLiveStats({ ...base, total24h: 3, escalated24h: 2 });
    expect(s.resolved_last_24h).toBe(33.3);
    expect(s.escalation_rate).toBe(66.7);
  });

  it('passa open_tickets e tempo de resposta adiante', () => {
    const s = computeQualityLiveStats({ ...base, openTickets: 12, avgResponseMs: 45000.7 });
    expect(s.open_tickets).toBe(12);
    expect(s.avg_response_time_ms).toBe(45001);
  });

  it('CSAT sem fonte fica 0 (não inventa)', () => {
    const s = computeQualityLiveStats({ ...base, avgCsatWeek: null });
    expect(s.avg_csat_week).toBe(0);
  });

  it('usa o nome do agente quando presente', () => {
    const s = computeQualityLiveStats({ ...base, topEscalatingAgent: '  Maria  ' });
    expect(s.top_escalating_agent).toBe('Maria');
  });
});

describe('pickTopAgentId', () => {
  it('devolve o id mais frequente ignorando nulls', () => {
    expect(pickTopAgentId(['a', null, 'b', 'a', undefined, 'a', 'b'])).toBe('a');
  });

  it('null quando não há agente algum', () => {
    expect(pickTopAgentId([null, undefined, null])).toBeNull();
  });

  it('empate → primeiro a atingir a contagem máxima', () => {
    expect(pickTopAgentId(['x', 'y', 'x', 'y'])).toBe('x');
  });
});
