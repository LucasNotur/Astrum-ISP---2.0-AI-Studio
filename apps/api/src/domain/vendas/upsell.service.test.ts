import { describe, it, expect } from 'vitest';
import { sanitizeUpsellInput, UpsellValidationError } from './upsell.service';

describe('sanitizeUpsellInput', () => {
  it('outcome inválido vira "offered" (default)', () => {
    const rec = sanitizeUpsellInput({ outcome: 'banana' }, 'tenant-a');
    expect(rec.outcome).toBe('offered');
  });

  it('outcome "converted" explícito é preservado', () => {
    const rec = sanitizeUpsellInput({ outcome: 'converted' }, 'tenant-a');
    expect(rec.outcome).toBe('converted');
  });

  it('outcome "rejected" explícito é preservado', () => {
    const rec = sanitizeUpsellInput({ outcome: 'rejected' }, 'tenant-a');
    expect(rec.outcome).toBe('rejected');
  });

  it('tenant do body é ignorado — o tenant do JWT vence', () => {
    const rec = sanitizeUpsellInput({ tenantId: 'tenant-malicioso' }, 'tenant-jwt');
    expect(rec.tenant_id).toBe('tenant-jwt');
  });

  it('campos ausentes viram null', () => {
    const rec = sanitizeUpsellInput({}, 'tenant-a');
    expect(rec.customer_id).toBeNull();
    expect(rec.current_plan).toBeNull();
    expect(rec.suggested_plan).toBeNull();
    expect(rec.operator_id).toBeNull();
  });

  it('lança UpsellValidationError quando o tenant está ausente', () => {
    expect(() => sanitizeUpsellInput({ outcome: 'converted' }, '')).toThrow(UpsellValidationError);
  });

  it('preserva customerId/currentPlan/suggestedPlan e o operatorId do JWT', () => {
    const rec = sanitizeUpsellInput(
      { customerId: 'c1', currentPlan: 'Básico', suggestedPlan: 'Pro' },
      'tenant-a',
      'op-42',
    );
    expect(rec.customer_id).toBe('c1');
    expect(rec.current_plan).toBe('Básico');
    expect(rec.suggested_plan).toBe('Pro');
    expect(rec.operator_id).toBe('op-42');
  });
});
