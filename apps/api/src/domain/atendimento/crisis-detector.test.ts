import { describe, it, expect } from 'vitest';
import { detectCrises, crisisSuppressions, type IncomingComplaint } from './crisis-detector';

const now = 1_000_000_000_000;
const config = { windowMs: 5 * 60_000, minComplaints: 10 };

function complaints(region: string, n: number, base = now): IncomingComplaint[] {
  return Array.from({ length: n }, (_, i) => ({ customerId: `c-${region}-${i}`, region, timestamp: base - i * 1000 }));
}

describe('detectCrises', () => {
  it('detecta crise quando região passa o gatilho de clientes distintos', () => {
    const crises = detectCrises(complaints('CTO-Centro', 12), config, now);
    expect(crises).toHaveLength(1);
    expect(crises[0].region).toBe('CTO-Centro');
    expect(crises[0].count).toBe(12);
  });

  it('NÃO detecta abaixo do gatilho', () => {
    expect(detectCrises(complaints('CTO-Sul', 9), config, now)).toHaveLength(0);
  });

  it('mesmo cliente repetindo NÃO infla a contagem (clientes distintos)', () => {
    const spam = Array.from({ length: 15 }, (_, i) => ({ customerId: 'mesmo-cliente', region: 'CTO-X', timestamp: now - i * 100 }));
    expect(detectCrises(spam, config, now)).toHaveLength(0);
  });

  it('ignora reclamações fora da janela', () => {
    const old = complaints('CTO-Velho', 12, now - 10 * 60_000); // 10min atrás, fora da janela de 5min
    expect(detectCrises(old, config, now)).toHaveLength(0);
  });

  it('múltiplas regiões em crise ordenadas por contagem', () => {
    const mix = [...complaints('CTO-A', 20), ...complaints('CTO-B', 11)];
    const crises = detectCrises(mix, config, now);
    expect(crises.map((c) => c.region)).toEqual(['CTO-A', 'CTO-B']);
  });
});

describe('crisisSuppressions', () => {
  it('suprime SLA e cobrança dos clientes afetados', () => {
    const [crisis] = detectCrises(complaints('CTO-Centro', 12), config, now);
    const s = crisisSuppressions(crisis);
    expect(s.suppressSla).toBe(true);
    expect(s.suppressCobranca).toBe(true);
    expect(s.affectedCustomers).toHaveLength(12);
  });
});
