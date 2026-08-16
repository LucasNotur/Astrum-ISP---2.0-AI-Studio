import { describe, it, expect } from 'vitest';
import {
  resolveAsaasAction,
  buildInvoiceStatusPatch,
  buildInvoicePaidJob,
} from './asaas-webhook.service';

describe('asaas-webhook.service', () => {
  describe('resolveAsaasAction', () => {
    it('PAYMENT_RECEIVED -> mark_paid', () => {
      expect(resolveAsaasAction('PAYMENT_RECEIVED')).toBe('mark_paid');
    });

    it('PAYMENT_CONFIRMED -> mark_paid', () => {
      expect(resolveAsaasAction('PAYMENT_CONFIRMED')).toBe('mark_paid');
    });

    it('PAYMENT_RECEIVED_IN_CASH -> mark_paid', () => {
      expect(resolveAsaasAction('PAYMENT_RECEIVED_IN_CASH')).toBe('mark_paid');
    });

    it('PAYMENT_OVERDUE -> mark_overdue', () => {
      expect(resolveAsaasAction('PAYMENT_OVERDUE')).toBe('mark_overdue');
    });

    it('PAYMENT_DELETED -> mark_cancelled', () => {
      expect(resolveAsaasAction('PAYMENT_DELETED')).toBe('mark_cancelled');
    });

    it('evento desconhecido -> ignore', () => {
      expect(resolveAsaasAction('PAYMENT_UPDATED')).toBe('ignore');
    });

    it('evento ausente/nulo -> ignore', () => {
      expect(resolveAsaasAction(undefined)).toBe('ignore');
      expect(resolveAsaasAction(null)).toBe('ignore');
    });
  });

  describe('buildInvoiceStatusPatch', () => {
    const now = '2026-08-16T12:00:00.000Z';

    it('mark_paid -> status paid + paid_at', () => {
      expect(buildInvoiceStatusPatch('mark_paid', now)).toEqual({ status: 'paid', paid_at: now });
    });

    it('mark_overdue -> status overdue sem paid_at', () => {
      expect(buildInvoiceStatusPatch('mark_overdue', now)).toEqual({ status: 'overdue' });
    });

    it('mark_cancelled -> status cancelled sem paid_at', () => {
      expect(buildInvoiceStatusPatch('mark_cancelled', now)).toEqual({ status: 'cancelled' });
    });

    it('ignore -> null (nada a aplicar)', () => {
      expect(buildInvoiceStatusPatch('ignore', now)).toBeNull();
    });
  });

  describe('buildInvoicePaidJob', () => {
    const row = { id: 'inv-1', tenant_id: 't-1', customer_id: 'cust-1' };

    it('monta o job com amountCents quando presente', () => {
      expect(buildInvoicePaidJob(row, 9990)).toEqual({
        tenantId: 't-1',
        customerId: 'cust-1',
        invoiceId: 'inv-1',
        amountCents: 9990,
      });
    });

    it('amountCents ausente/null vira undefined (não quebra o job)', () => {
      expect(buildInvoicePaidJob(row, null)).toEqual({
        tenantId: 't-1',
        customerId: 'cust-1',
        invoiceId: 'inv-1',
        amountCents: undefined,
      });
    });
  });
});
