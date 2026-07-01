import { describe, it, expect } from 'vitest';
import { mapOutboxEventToSvix, shouldEmitOutbound, buildOutboundDelivery } from './outbound-events';

describe('mapOutboxEventToSvix', () => {
  it('mapeia eventos conhecidos', () => {
    expect(mapOutboxEventToSvix('invoice.paid')).toBe('invoice.paid');
    expect(mapOutboxEventToSvix('customer.suspended')).toBe('customer.suspended');
  });

  it('evento interno não propagável → null', () => {
    expect(mapOutboxEventToSvix('internal.debug')).toBeNull();
    expect(mapOutboxEventToSvix('etl.done')).toBeNull();
  });
});

describe('shouldEmitOutbound', () => {
  it('true só para eventos que o ISP deve receber', () => {
    expect(shouldEmitOutbound('ticket.resolved')).toBe(true);
    expect(shouldEmitOutbound('message.saved')).toBe(false);
  });
});

describe('buildOutboundDelivery', () => {
  it('monta a entrega com tenant, tipo e payload carimbado', () => {
    const d = buildOutboundDelivery('t1', 'invoice.paid', { invoiceId: 'i1', amountCents: 9990 });
    expect(d.tenantId).toBe('t1');
    expect(d.eventType).toBe('invoice.paid');
    expect(d.payload.invoiceId).toBe('i1');
    expect(d.payload.emittedAt).toBeDefined();
  });

  it('lança para evento não propagável (evita fan-out indevido)', () => {
    expect(() => buildOutboundDelivery('t1', 'internal.x', {})).toThrow(/não propagável/);
  });
});
