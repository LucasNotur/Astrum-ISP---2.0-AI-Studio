import { describe, it, expect } from 'vitest';
import { toTs, applyShapeCompat } from './shape-compat';

describe('toTs', () => {
  it('converte ISO/date em { seconds } e trata nulo/invalido', () => {
    expect(toTs('2026-08-10')).toEqual({ seconds: Math.floor(Date.parse('2026-08-10') / 1000) });
    expect(toTs(null)).toBeNull();
    expect(toTs(undefined)).toBeNull();
    expect(toTs('nao-e-data')).toBeNull();
  });
});

describe('applyShapeCompat — adiciona aliases sem remover campos reais', () => {
  it('invoices: amount (reais), dueDate.seconds, customerId', () => {
    const [o] = applyShapeCompat('invoices', [{
      amount_cents: 9999, customer_id: 'c1', due_date: '2026-08-10',
      paid_at: '2026-08-05T00:00:00Z', status: 'paid',
    }]);
    expect(o.amount).toBe(99.99);
    expect(o.amount_cents).toBe(9999);          // real preservado
    expect(o.customerId).toBe('c1');
    expect(o.dueDate).toEqual({ seconds: Math.floor(Date.parse('2026-08-10') / 1000) });
    expect(o.paidAt?.seconds).toBeTypeOf('number');
  });

  it('customers: mrr (reais), plan, createdAt', () => {
    const [o] = applyShapeCompat('customers', [{
      mrr_cents: 6299, plan_id: '100 Mega', cpf: '123', created_at: '2026-08-01T00:00:00Z',
    }]);
    expect(o.mrr).toBe(62.99);
    expect(o.plan).toBe('100 Mega');
    expect(o.document).toBe('123');
    expect(o.createdAt?.seconds).toBeTypeOf('number');
  });

  it('tickets: subject vem de title, aiHandled de resolved_by_ai', () => {
    const [o] = applyShapeCompat('tickets', [{ title: 'Ajuda', resolved_by_ai: true, customer_id: 'c1' }]);
    expect(o.subject).toBe('Ajuda');
    expect(o.title).toBe('Ajuda');              // real preservado
    expect(o.aiHandled).toBe(true);
  });

  it('service_orders: lat/lng de latitude/longitude (MapPage legado)', () => {
    const [o] = applyShapeCompat('service_orders', [{
      latitude: -22.97, longitude: -43.18, assigned_to: null, customer_name: 'Ana', customer_id: 'c1',
    }]);
    expect(o.lat).toBe(-22.97);
    expect(o.lng).toBe(-43.18);
    expect(o.latitude).toBe(-22.97);            // real preservado (MapPage novo lê latitude)
    expect(o.customerName).toBe('Ana');
  });

  it('não sobrescreve alias já presente e é robusto a linha nula', () => {
    const [o] = applyShapeCompat('invoices', [{ amount_cents: 100, amount: 999 }]);
    expect(o.amount).toBe(999);                 // não sobrescreve o que já veio
    expect(applyShapeCompat('customers', [null as any])).toEqual([null]);
  });
});
