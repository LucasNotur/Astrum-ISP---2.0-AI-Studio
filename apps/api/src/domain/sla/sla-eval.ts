/**
 * SLA Eval — avalia violação de SLA de resposta e resolução. Port do slaWorker (S79).
 * Função pura; o worker só busca tickets e persiste o resultado.
 */

export interface SlaConfig {
  responseMinutes: number;   // default 15
  resolutionHours: number;   // default 24
}

export interface TicketForSla {
  createdAt: string;         // ISO
  humanResponded?: boolean;
  status: string;
  slaBreached?: boolean;
}

export type SlaBreach = { breached: boolean; type: 'response' | 'resolution' | null; elapsedMin: number };

export const DEFAULT_SLA: SlaConfig = { responseMinutes: 15, resolutionHours: 24 };

export function evaluateSla(ticket: TicketForSla, config: SlaConfig, now: Date = new Date()): SlaBreach {
  if (ticket.slaBreached) return { breached: false, type: null, elapsedMin: 0 }; // já contabilizado
  const created = new Date(ticket.createdAt).getTime();
  const elapsedMin = (now.getTime() - created) / 60000;

  // SLA de resposta: sem resposta humana e passou do limite.
  if (!ticket.humanResponded && elapsedMin > config.responseMinutes) {
    return { breached: true, type: 'response', elapsedMin };
  }
  // SLA de resolução: ainda aberto e passou do limite de horas.
  const open = ['open', 'escalated', 'waiting_queue', 'in_progress'].includes(ticket.status);
  if (open && elapsedMin > config.resolutionHours * 60) {
    return { breached: true, type: 'resolution', elapsedMin };
  }
  return { breached: false, type: null, elapsedMin };
}

/** Nível de aviso de SLA por tempo decorrido (para escalonar mensagens ao cliente). */
export function slaWarningLevel(elapsedMin: number, responseMinutes: number): 0 | 1 | 2 {
  if (elapsedMin > responseMinutes * 2) return 2; // muito atrasado → supervisor
  if (elapsedMin > responseMinutes) return 1;      // atrasado → aviso
  return 0;
}
