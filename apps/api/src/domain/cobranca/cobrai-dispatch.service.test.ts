import { describe, it, expect } from 'vitest';
import { overdueDaysOf, computeStage, buildCobraiEnqueue } from './cobrai-dispatch.service';

const NOW = Date.UTC(2026, 7, 15); // 2026-08-15
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString();

describe('overdueDaysOf', () => {
  it('conta dias de atraso e trata data inválida', () => {
    expect(overdueDaysOf(iso(2026, 7, 5), NOW)).toBe(10);
    expect(overdueDaysOf(iso(2026, 7, 20), NOW)).toBe(-5); // ainda não venceu
    expect(overdueDaysOf('não-é-data', NOW)).toBe(0);
  });
});

describe('computeStage', () => {
  it('mapeia os limiares da régua (mesmos do legado)', () => {
    expect(computeStage(iso(2026, 6, 10), NOW)).toBe('D_PLUS_30'); // ~36d
    expect(computeStage(iso(2026, 6, 28), NOW)).toBe('D_PLUS_15'); // ~18d
    expect(computeStage(iso(2026, 7, 10), NOW)).toBe('D_PLUS_3');  // 5d
    expect(computeStage(iso(2026, 7, 15), NOW)).toBe('D_ZERO');    // 0d
    expect(computeStage(iso(2026, 7, 14), NOW)).toBe('D_ZERO');    // 1d de atraso → já venceu (D_ZERO), não pré-vencimento
    expect(computeStage(iso(2026, 7, 13), NOW)).toBe('D_ZERO');    // 2d de atraso → idem
    expect(computeStage(iso(2026, 7, 20), NOW)).toBe('D_MINUS_5'); // não venceu (-5d)
  });
});

describe('buildCobraiEnqueue', () => {
  const input = { customerId: 'c1', tenantId: 't1', stage: 'D_PLUS_3' as const, invoiceId: 'inv1', amountCents: 5000 };

  it('monta shape CobraiJobData (v2 — única engine desde a C1) com invoiceId/action', () => {
    expect(buildCobraiEnqueue(input)).toEqual({
      name: 'send_message',
      data: { tenantId: 't1', customerId: 'c1', invoiceId: 'inv1', action: 'send_message', amountCents: 5000 },
    });
  });

  it('sem invoiceId → invoiceId vazio (não quebra)', () => {
    const { data } = buildCobraiEnqueue({ customerId: 'c1', tenantId: 't1', stage: 'D_ZERO' });
    expect(data.invoiceId).toBe('');
  });
});
