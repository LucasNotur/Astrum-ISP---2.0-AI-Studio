/**
 * Outbound Events — mapeia eventos internos (Outbox) para eventos Svix outbound.
 * Plano Mestre V2, S90 (dossiê item 38). Puro e testável. Liga o Outbox Pattern
 * (consistência transacional) à entrega gerenciada pelo Svix (retry/assinatura).
 */

export type SvixEventType =
  | 'invoice.paid' | 'invoice.overdue' | 'invoice.cancelled'
  | 'ticket.created' | 'ticket.resolved' | 'ticket.escalated'
  | 'customer.suspended' | 'customer.activated';

/** Eventos internos do Outbox que devem ser propagados ao ISP (fan-out). */
const OUTBOX_TO_SVIX: Record<string, SvixEventType> = {
  'invoice.paid': 'invoice.paid',
  'invoice.overdue': 'invoice.overdue',
  'invoice.cancelled': 'invoice.cancelled',
  'ticket.created': 'ticket.created',
  'ticket.resolved': 'ticket.resolved',
  'ticket.escalated': 'ticket.escalated',
  'customer.suspended': 'customer.suspended',
  'customer.activated': 'customer.activated',
};

/** Mapeia um tipo de evento do Outbox para o evento Svix, ou null se não deve propagar. */
export function mapOutboxEventToSvix(outboxType: string): SvixEventType | null {
  return OUTBOX_TO_SVIX[outboxType] ?? null;
}

/** True se o evento do Outbox deve gerar entrega outbound. */
export function shouldEmitOutbound(outboxType: string): boolean {
  return mapOutboxEventToSvix(outboxType) !== null;
}

export interface OutboundDelivery {
  tenantId: string;
  eventType: SvixEventType;
  payload: Record<string, unknown>;
}

/** Monta a entrega outbound a partir de um registro do Outbox. Lança se não propagável. */
export function buildOutboundDelivery(
  tenantId: string,
  outboxType: string,
  data: Record<string, unknown>,
): OutboundDelivery {
  const eventType = mapOutboxEventToSvix(outboxType);
  if (!eventType) throw new Error(`Evento do Outbox não propagável: ${outboxType}`);
  return { tenantId, eventType, payload: { ...data, emittedAt: new Date().toISOString() } };
}
