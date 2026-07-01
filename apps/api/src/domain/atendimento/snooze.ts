/**
 * Snooze — reagendamento de follow-ups. Port do snoozeWorker (S79).
 * Puro: dado o instante atual, decide o que está vencido para reativar.
 */

export interface SnoozedItem {
  id: string;
  snoozedUntil: string;  // ISO
}

/** True se o snooze já venceu (deve reativar). */
export function isSnoozeDue(snoozedUntil: string, now: Date = new Date()): boolean {
  const until = new Date(snoozedUntil).getTime();
  return Number.isFinite(until) && until <= now.getTime();
}

/** Filtra os itens cujo snooze venceu, para o worker reativar em lote. */
export function dueSnoozes<T extends SnoozedItem>(items: T[], now: Date = new Date()): T[] {
  return items.filter((i) => isSnoozeDue(i.snoozedUntil, now));
}
