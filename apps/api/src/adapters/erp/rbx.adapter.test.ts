import { describe, it, expect, vi } from 'vitest';
import { RBXAdapter } from './rbx.adapter';
import type { HttpClient } from './erp.types';

function makeHttp(data: unknown, ok = true): HttpClient {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => data,
  });
}

const creds = { url: 'https://rbx.isp.test', token: 'chave-integracao-123' };
const V1 = 'https://rbx.isp.test/routerbox/ws/rbx_server_json.php';
const V2 = 'https://rbx.isp.test/routerbox/ws_json/ws_json.php';

describe('RBXAdapter', () => {
  it('lança se url ou token ausentes', () => {
    expect(() => new RBXAdapter({ url: '', token: 'x' })).toThrow('RBX: credenciais ausentes');
    expect(() => new RBXAdapter({ url: 'http://x', token: '' })).toThrow('RBX: credenciais ausentes');
  });

  it('findCustomerByCpf — POST v1 ConsultaClientes com ChaveIntegracao no corpo (não header)', async () => {
    const http = makeHttp({ status: 1 });
    const adapter = new RBXAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    expect(http).toHaveBeenCalledWith(V1, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        ConsultaClientes: {
          Autenticacao: { ChaveIntegracao: 'chave-integracao-123' },
          Filtro: "CPF = '11122233344'",
        },
      }),
    }));
    const init = (http as any).mock.calls[0][1];
    expect(init.headers.authentication_key).toBeUndefined();
  });

  it('getBillingStatus — POST v2 get_unpaid_document com authentication_key no header e account_number=1 (default)', async () => {
    const http = makeHttp({ status: 1, result: [{ id: 1, value_up: 114.63 }] });
    const adapter = new RBXAdapter(creds, http);
    const result = await adapter.getBillingStatus('330531');
    expect(http).toHaveBeenCalledWith(V2, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authentication_key: 'chave-integracao-123' }),
      body: JSON.stringify({ get_unpaid_document: { customer_id: 330531, account_number: 1 } }),
    }));
    expect(result).toEqual([{ id: 1, value_up: 114.63 }]);
  });

  it('getBillingStatus — usa accountNumber da credencial quando informado', async () => {
    const http = makeHttp({ status: 1, result: [] });
    const adapter = new RBXAdapter({ ...creds, accountNumber: '3' }, http);
    await adapter.getBillingStatus('330531');
    expect(http).toHaveBeenCalledWith(V2, expect.objectContaining({
      body: JSON.stringify({ get_unpaid_document: { customer_id: 330531, account_number: 3 } }),
    }));
  });

  it('getBillingStatus — lança quando status=0 (erro de negócio)', async () => {
    const http = makeHttp({ status: 0, error_description: 'The field customer_id is required!' });
    const adapter = new RBXAdapter(creds, http);
    await expect(adapter.getBillingStatus('x')).rejects.toThrow('The field customer_id is required!');
  });

  it('generateSecondCopy — combina get_unpaid_document (valor/vencimento) + get_barcode (linha) + get_banking_billet (PDF)', async () => {
    const http = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (body.get_unpaid_document) {
        expect(body.get_unpaid_document).toEqual({ customer_id: 1, account_number: 1 });
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 1, result: [{ id: 12345, due_date: '2026-11-15', value_up: 89.9 }] }) };
      }
      if (body.get_barcode) {
        expect(body.get_barcode).toEqual({ banking_billet_id: 12345, send_barcode: false });
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 1, result: '11111.22222 33333.444444 55555.666666 7 88888888888888' }) };
      }
      if (body.get_banking_billet) {
        expect(body.get_banking_billet).toEqual({ document_id: 12345 });
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 1, result: { banking_billet_link: 'https://meurbx.com/routerbox/tmp/boleto_1.pdf', banking_billet_available: 15 } }) };
      }
      throw new Error('unexpected body ' + init.body);
    });
    const adapter = new RBXAdapter(creds, http as unknown as HttpClient);
    const result = await adapter.generateSecondCopy('1', '12345');
    expect(result.boletoUrl).toBe('https://meurbx.com/routerbox/tmp/boleto_1.pdf');
    expect(result.pixCopiaCola).toBe('');
    expect(result.barcode).toBe('11111.22222 33333.444444 55555.666666 7 88888888888888');
    expect(result.dueDate).toBe('2026-11-15');
    expect(result.amountCents).toBe(8990);
  });

  it('generateSecondCopy — não quebra se get_barcode ou get_banking_billet falharem (campos ficam vazios)', async () => {
    const http = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (body.get_unpaid_document) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 1, result: [{ id: 12345, due_date: '2026-11-15', value_up: 50 }] }) };
      }
      return { ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({}) };
    });
    const adapter = new RBXAdapter(creds, http as unknown as HttpClient);
    const result = await adapter.generateSecondCopy('1', '12345');
    expect(result.boletoUrl).toBe('');
    expect(result.barcode).toBe('');
    expect(result.dueDate).toBe('2026-11-15');
    expect(result.amountCents).toBe(5000);
  });

  it('getConnectionStatus — online quando get_online_customer retorna sessão', async () => {
    const http = makeHttp({ status: 1, result: [{ session_id: 'abc', customer_id: '330074' }] });
    const adapter = new RBXAdapter(creds, http);
    const result = await adapter.getConnectionStatus('330074');
    expect(http).toHaveBeenCalledWith(V2, expect.objectContaining({
      body: JSON.stringify({ get_online_customer: { customer_id: 330074 } }),
    }));
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando result vem vazio (sem sessão ativa)', async () => {
    const http = makeHttp({ status: 1, result: [] });
    const adapter = new RBXAdapter(creds, http);
    const result = await adapter.getConnectionStatus('330074');
    expect(result.online).toBe(false);
  });

  it('unlockCustomer — resolve contract_id via get_equipment_customer, depois chama contract_unblock', async () => {
    const http = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (body.get_equipment_customer) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 1, result: [{ contract_id: '9121' }] }) };
      }
      if (body.contract_unblock) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 1, result: 'ok' }) };
      }
      throw new Error('unexpected body ' + init.body);
    });
    const adapter = new RBXAdapter(creds, http as unknown as HttpClient);
    await adapter.unlockCustomer('330593');
    expect(http).toHaveBeenCalledWith(V2, expect.objectContaining({
      body: JSON.stringify({ contract_unblock: { customer_id: 330593, contract_id: 9121 } }),
    }));
  });

  it('unlockCustomer — lança quando não consegue resolver contract_id', async () => {
    const http = makeHttp({ status: 1, result: [] });
    const adapter = new RBXAdapter(creds, http);
    await expect(adapter.unlockCustomer('330593')).rejects.toThrow('não foi possível resolver o contract_id');
  });

  it('lança quando API responde !ok', async () => {
    const http = makeHttp({}, false);
    const adapter = new RBXAdapter(creds, http);
    await expect(adapter.getBillingStatus('1')).rejects.toThrow('RBX API Error: 500');
  });
});
