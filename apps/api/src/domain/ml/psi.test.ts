import { describe, it, expect } from 'vitest';
import { psi, psiSeverity } from './psi';

describe('psi()', () => {
  it('distribuições idênticas → retorna 0', () => {
    const dist = { a: 30, b: 50, c: 20 };
    const v = psi(dist, dist);
    expect(v).toBeCloseTo(0, 10);
  });

  it('categoria nova com 20% do tráfego → PSI > 0.1', () => {
    const expected = { suporte: 80, cobranca: 20 };
    const actual = { suporte: 60, cobranca: 20, nova_intent: 20 };
    const v = psi(expected, actual);
    expect(v).toBeGreaterThan(0.1);
  });

  it('categoria ausente em um lado NÃO explode (suavização epsilon)', () => {
    const expected = { a: 10, b: 10, c: 10 };
    const actual = { a: 30, b: 30 };
    expect(() => psi(expected, actual)).not.toThrow();
    const v = psi(expected, actual);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  });

  it('entradas vazias em ambos os lados → 0 (sem ruído)', () => {
    const v = psi({}, {});
    expect(v).toBeCloseTo(0, 10);
  });

  it('drift extremo → PSI alto', () => {
    const expected = { a: 100 };
    const actual = { b: 100 };
    const v = psi(expected, actual);
    expect(v).toBeGreaterThan(1);
  });
});

describe('psiSeverity()', () => {
  it('0.09 → "ok"', () => {
    expect(psiSeverity(0.09)).toBe('ok');
  });

  it('0.10 → "medio" (limite inclusivo)', () => {
    expect(psiSeverity(0.10)).toBe('medio');
  });

  it('0.24 → "medio" (limite inclusivo)', () => {
    expect(psiSeverity(0.24)).toBe('medio');
  });

  it('0.25 → "alto" (limite inclusivo)', () => {
    expect(psiSeverity(0.25)).toBe('alto');
  });

  it('1.0 → "alto"', () => {
    expect(psiSeverity(1.0)).toBe('alto');
  });
});
