/**
 * Feriados nacionais brasileiros (SettingsPage → "Carregar feriados nacionais").
 * Funções PURAS, sem dependência de API externa: os feriados nacionais são
 * determinísticos (fixos + derivados da Páscoa), então computa-se localmente —
 * mais confiável e testável que um fetch a serviço de terceiros.
 *
 * Inclui os feriados nacionais oficiais (Lei): fixos + Sexta-feira Santa.
 * Consciência Negra (20/11) virou feriado nacional pela Lei 14.759/2023 (2024+).
 * Carnaval e Corpus Christi são pontos FACULTATIVOS (não entram como nacionais).
 */

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: string; // 'nacional' aqui
}

/** Domingo de Páscoa (algoritmo de Computus / Gauss-Anônimo Gregoriano). */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=março, 4=abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Soma `days` a uma data (year, month 1-based, day) e devolve YYYY-MM-DD. */
function addDaysIso(year: number, month: number, day: number, days: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Feriados nacionais do ano (ordenados por data). */
export function computeNationalHolidays(year: number): Holiday[] {
  const nac = (date: string, name: string): Holiday => ({ date, name, type: 'nacional' });

  const easter = easterSunday(year);
  const goodFriday = addDaysIso(year, easter.month, easter.day, -2);

  const list: Holiday[] = [
    nac(iso(year, 1, 1), 'Confraternização Universal'),
    nac(goodFriday, 'Sexta-feira Santa'),
    nac(iso(year, 4, 21), 'Tiradentes'),
    nac(iso(year, 5, 1), 'Dia do Trabalho'),
    nac(iso(year, 9, 7), 'Independência do Brasil'),
    nac(iso(year, 10, 12), 'Nossa Senhora Aparecida'),
    nac(iso(year, 11, 2), 'Finados'),
    nac(iso(year, 11, 15), 'Proclamação da República'),
    nac(iso(year, 11, 20), 'Consciência Negra'),
    nac(iso(year, 12, 25), 'Natal'),
  ];

  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Mescla os feriados novos nos existentes SEM sobrescrever entradas manuais:
 * uma data já presente é mantida como está. Devolve a lista mesclada (ordenada)
 * e quantos foram efetivamente adicionados.
 */
export function mergeHolidays(
  existing: Array<{ date: string; name?: string; type?: string }>,
  incoming: Holiday[],
): { merged: Holiday[]; added: number } {
  const byDate = new Map<string, Holiday>();
  for (const h of existing) {
    if (h?.date) byDate.set(h.date, { date: h.date, name: h.name ?? '', type: h.type ?? 'municipal' });
  }
  let added = 0;
  for (const h of incoming) {
    if (!byDate.has(h.date)) {
      byDate.set(h.date, h);
      added++;
    }
  }
  const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { merged, added };
}
