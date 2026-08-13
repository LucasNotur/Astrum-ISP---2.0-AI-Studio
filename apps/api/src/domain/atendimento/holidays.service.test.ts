import { describe, it, expect } from 'vitest';
import { easterSunday, computeNationalHolidays, mergeHolidays } from './holidays.service';

describe('easterSunday', () => {
  // Datas de Páscoa conhecidas (verificáveis).
  it.each([
    [2024, 3, 31],
    [2025, 4, 20],
    [2026, 4, 5],
  ])('Páscoa de %i = %i/%i', (year, month, day) => {
    expect(easterSunday(year)).toEqual({ month, day });
  });
});

describe('computeNationalHolidays', () => {
  it('inclui os fixos + Sexta-feira Santa derivada da Páscoa', () => {
    const hs = computeNationalHolidays(2026);
    const dates = hs.map((h) => h.date);
    expect(dates).toContain('2026-01-01'); // Confraternização
    expect(dates).toContain('2026-04-21'); // Tiradentes
    expect(dates).toContain('2026-12-25'); // Natal
    expect(dates).toContain('2026-11-20'); // Consciência Negra
    // Páscoa 2026 = 05/04 → Sexta-feira Santa = 03/04
    expect(dates).toContain('2026-04-03');
  });

  it('vem ordenado por data e todos tipo nacional', () => {
    const hs = computeNationalHolidays(2026);
    const sorted = [...hs].sort((a, b) => a.date.localeCompare(b.date));
    expect(hs).toEqual(sorted);
    expect(hs.every((h) => h.type === 'nacional')).toBe(true);
  });
});

describe('mergeHolidays', () => {
  it('adiciona só as datas novas e conta certo', () => {
    const existing = [{ date: '2026-01-01', name: 'Meu Ano Novo', type: 'municipal' }];
    const incoming = computeNationalHolidays(2026);
    const { merged, added } = mergeHolidays(existing, incoming);
    expect(added).toBe(incoming.length - 1); // 01/01 já existia
    // Não sobrescreve a entrada manual
    expect(merged.find((h) => h.date === '2026-01-01')?.name).toBe('Meu Ano Novo');
  });

  it('lista vazia → adiciona todos', () => {
    const incoming = computeNationalHolidays(2026);
    const { merged, added } = mergeHolidays([], incoming);
    expect(added).toBe(incoming.length);
    expect(merged.length).toBe(incoming.length);
  });

  it('idempotente: recarregar não duplica', () => {
    const incoming = computeNationalHolidays(2026);
    const once = mergeHolidays([], incoming);
    const twice = mergeHolidays(once.merged, incoming);
    expect(twice.added).toBe(0);
    expect(twice.merged.length).toBe(once.merged.length);
  });
});
