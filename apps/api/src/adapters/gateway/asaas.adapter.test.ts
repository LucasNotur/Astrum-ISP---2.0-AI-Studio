import { describe, it, expect, vi } from 'vitest';
import { AsaasAdapter } from './asaas.adapter';
import type { HttpClient } from '../erp/erp.types';

function makeHttp(pages: unknown[]): HttpClient {
  let call = 0;
  return vi.fn().mockImplementation(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => pages[Math.min(call++, pages.length - 1)],
  }));
}

const creds = { apiKey: 'asaas-key-test' };

describe('AsaasAdapter (H6-03 — o conector do Cobra e do Gênesis)', () => {
  it('lança sem apiKey', () => {
    expect(() => new AsaasAdapter({ apiKey: '' })).toThrow('apiKey ausente');
  });

  it('lista inadimplentes normalizando valores (reais → centavos) e status', async () => {
    const http = makeHttp([{
      hasMore: false,
      data: [{
        id: 'pay_1', customer: 'cus_9', value: 99.9, status: 'OVERDUE',
        dueDate: '2026-07-01', paymentDate: null,
        bankSlipUrl: 'https://asaas/boleto/1',
        pixTransaction: { qrCode: { payload: '000201PIX' } },
      }],
    }]);
    const a = new AsaasAdapter(creds, http);
    const charges = await a.listOverdue();
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({
      externalId: 'pay_1',
      customerExternalId: 'cus_9',
      amountCents: 9990,
      status: 'overdue',
      dueDate: '2026-07-01',
      invoiceUrl: 'https://asaas/boleto/1',
      pixCopyPaste: '000201PIX',
    });
    // auth pelo header access_token + endpoint certo
    const [url, init] = vi.mocked(http).mock.calls[0]!;
    expect(url).toContain('/payments?status=OVERDUE');
    expect(init.headers.access_token).toBe('asaas-key-test');
  });

  it('mapeia RECEIVED/CONFIRMED → paid e PENDING → pending', async () => {
    const http = makeHttp([{
      hasMore: false,
      data: [
        { id: 'p1', customer: 'c', value: 10, status: 'RECEIVED', dueDate: '2026-07-01', paymentDate: '2026-07-01' },
        { id: 'p2', customer: 'c', value: 10, status: 'PENDING', dueDate: '2026-08-01' },
      ],
    }]);
    const charges = await new AsaasAdapter(creds, http).listCharges();
    expect(charges[0]!.status).toBe('paid');
    expect(charges[0]!.paidAt).toBe('2026-07-01');
    expect(charges[1]!.status).toBe('pending');
  });

  it('pagina enquanto hasMore=true (100 em 100)', async () => {
    const page = (id: string, hasMore: boolean) => ({
      hasMore, data: [{ id, customer: 'c', value: 10, status: 'OVERDUE', dueDate: '2026-07-01' }],
    });
    const http = makeHttp([page('a', true), page('b', true), page('c', false)]);
    const charges = await new AsaasAdapter(creds, http).listOverdue();
    expect(charges.map((c) => c.externalId)).toEqual(['a', 'b', 'c']);
    expect(vi.mocked(http).mock.calls[1]![0]).toContain('offset=100');
    expect(vi.mocked(http).mock.calls[2]![0]).toContain('offset=200');
  });

  it('sandbox usa api-sandbox.asaas.com', async () => {
    const http = makeHttp([{ hasMore: false, data: [] }]);
    await new AsaasAdapter({ apiKey: 'k', sandbox: true }, http).listCharges();
    expect(vi.mocked(http).mock.calls[0]![0]).toContain('api-sandbox.asaas.com/v3');
  });

  it('lista clientes com telefone/cpf normalizados', async () => {
    const http = makeHttp([{
      hasMore: false,
      data: [{ id: 'cus_1', name: 'Maria Silva', cpfCnpj: '90000000000', mobilePhone: '+5519999', email: null }],
    }]);
    const customers = await new AsaasAdapter(creds, http).listCustomers();
    expect(customers[0]).toMatchObject({ externalId: 'cus_1', name: 'Maria Silva', phone: '+5519999' });
  });

  it('erro HTTP vira erro claro', async () => {
    const http = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) });
    await expect(new AsaasAdapter(creds, http as any).listOverdue()).rejects.toThrow('Asaas API Error: 401');
  });
});
