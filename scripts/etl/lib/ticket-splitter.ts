/**
 * Ticket Splitter — converte 1 ticket legado (com subcoleção `messages`) em
 * 1 conversation + N messages no modelo alvo. Plano Mestre V2, S70.
 *
 * Mudança de modelo relacional (gap report §1.4): legado pendura mensagem no ticket,
 * alvo pendura na conversation. Função pura e testável — sem I/O.
 */

import { mapMessageRole } from './transform';

export interface LegacyTicketMessage {
  id: string;
  senderType?: string; // customer | ai | human | system
  text?: string;
  createdAt?: string;
}

export interface LegacyTicket {
  id: string;
  customerId?: string;
  subject?: string;
  createdAt?: string;
  messages?: LegacyTicketMessage[];
}

export interface SplitResult {
  conversation: Record<string, unknown>;
  messages: Record<string, unknown>[];
  /** maior createdAt de mensagem — vira watermark do delta-sync */
  lastMessageAt: string | null;
}

/**
 * @param customerUuid FK já resolvido (null se cliente não migrado)
 * @param sinceIso se passado, só inclui mensagens com createdAt > sinceIso (delta-sync)
 */
export function splitTicket(
  tenantId: string,
  ticket: LegacyTicket,
  customerUuid: string | null,
  sinceIso?: string,
): SplitResult {
  const conversation = {
    tenant_id: tenantId,
    customer_id: customerUuid,
    channel: 'whatsapp',
    status: 'open',
    legacy_ticket_id: ticket.id,
    created_at: ticket.createdAt ?? new Date().toISOString(),
  };

  const all = (ticket.messages ?? [])
    .slice()
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')); // ordem cronológica

  const filtered = sinceIso
    ? all.filter((m) => (m.createdAt ?? '') > sinceIso)
    : all;

  const messages = filtered.map((m) => {
    const { role, fromAi } = mapMessageRole(m.senderType);
    return {
      tenant_id: tenantId,
      legacy_id: m.id,
      role,
      from_ai: fromAi,
      content: m.text ?? '',
      created_at: m.createdAt ?? new Date().toISOString(),
    };
  });

  const lastMessageAt = all.length ? (all[all.length - 1].createdAt ?? null) : null;

  return { conversation, messages, lastMessageAt };
}
