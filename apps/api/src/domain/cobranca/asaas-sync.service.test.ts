import { describe, it, expect, vi } from 'vitest';
import { mapChargeToInvoiceRow, syncAsaasInvoices, type AsaasSyncPorts } from './asaas-sync.service';
import type { AsaasCharge } from '../../adapters/gateway/asaas.adapter';

function charge(over: Partial<AsaasCharge> = {}): AsaasCharge {
  return {
    externalId: 'pay_1', customerExternalId: 'cus_1', amountCents: 9990,
    status: 'overdue', dueDate: '2026-07-10', paidAt: null,
    invoiceUrl: 'https://asaas.com/i/1', pixCopyPaste: '00020126...',
    ...over,
  };
}

describe('asaas-sync.service', () => {
  describe('mapChargeToInvoiceRow', () => {
    it('mapeia os campos da cobrança para a linha de invoices', () => {
      const row = mapChargeToInvoiceRow('t1', 'cust-uuid', charge());
      expect(row.tenant_id).toBe('t1');
      expect(row.customer_id).toBe('cust-uuid');
      expect(row.external_id).toBe('pay_1');
      expect(row.amount_cents).toBe(9990);
      expect(row.status).toBe('overdue');
      expect(row.due_date).toBe('2026-07-10');
      expect(row.payment_url).toBe('https://asaas.com/i/1');
      expect(row.pix_copy_paste).toBe('00020126...');
      expect(row.extra).toEqual({ source: 'asaas', customer_external_id: 'cus_1' });
    });
  });

  describe('syncAsaasInvoices', () => {
    function makePorts(charges: AsaasCharge[], over: Partial<AsaasSyncPorts> = {}): AsaasSyncPorts {
      return {
        listCharges: vi.fn().mockResolvedValue(charges),
        resolveCustomerId: vi.fn().mockResolvedValue('cust-uuid'),
        upsertInvoice: vi.fn().mockResolvedValue('inserted'),
        ...over,
      };
    }

    it('sincroniza todas as cobranças válidas', async () => {
      const ports = makePorts([charge({ externalId: 'a' }), charge({ externalId: 'b', status: 'pending' })]);
      const r = await syncAsaasInvoices('t1', ports);
      expect(r.fetched).toBe(2);
      expect(r.synced).toBe(2);
      expect(r.inserted).toBe(2);
      expect(r.overdue).toBe(1);
      expect(ports.upsertInvoice).toHaveBeenCalledTimes(2);
    });

    it('conta inserted vs updated', async () => {
      const ports = makePorts([charge({ externalId: 'a' }), charge({ externalId: 'b' })], {
        upsertInvoice: vi.fn().mockResolvedValueOnce('inserted').mockResolvedValueOnce('updated'),
      });
      const r = await syncAsaasInvoices('t1', ports);
      expect(r.inserted).toBe(1);
      expect(r.updated).toBe(1);
    });

    it('pula cobrança sem cliente local resolvido', async () => {
      const ports = makePorts([charge()], { resolveCustomerId: vi.fn().mockResolvedValue(null) });
      const r = await syncAsaasInvoices('t1', ports);
      expect(r.skippedNoCustomer).toBe(1);
      expect(r.synced).toBe(0);
      expect(ports.upsertInvoice).not.toHaveBeenCalled();
    });

    it('pula cobrança sem vencimento ou sem id externo', async () => {
      const ports = makePorts([charge({ dueDate: '' }), charge({ externalId: '' })]);
      const r = await syncAsaasInvoices('t1', ports);
      expect(r.skippedInvalid).toBe(2);
      expect(r.synced).toBe(0);
    });

    it('lista vazia → tudo zero', async () => {
      const r = await syncAsaasInvoices('t1', makePorts([]));
      expect(r).toEqual({ fetched: 0, synced: 0, overdue: 0, skippedNoCustomer: 0, skippedInvalid: 0, inserted: 0, updated: 0 });
    });
  });
});
