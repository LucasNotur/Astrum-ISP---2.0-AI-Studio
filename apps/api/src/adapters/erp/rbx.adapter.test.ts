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

  it('getBillingStatus — POST v2 get_unpaid_document com authentication_key no header', async () => {
    const http = makeHttp({ status: 1, result: [{ id: 1, value_up: 114.63 }] });
    const adapter = new RBXAdapter(creds, http);
    const result = await adapter.getBillingStatus('330531');
    expect(http).toHaveBeenCalledWith(V2, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authentication_key: 'chave-integracao-123' }),
      body: JSON.stringify({ get_unpaid_document: { customer_id: 330531 } }),
    }));
    expect(result).toEqual([{ id: 1, value_up: 114.63 }]);
  });

  it('getBillingStatus — lança quando status=0 (erro de negócio)', async () => {
    const http = makeHttp({ status: 0, error_description: 'The field customer_id is required!' });
    const adapter = new RBXAdapter(creds, http);
    await expect(adapter.getBillingStatus('x')).rejects.toThrow('The field customer_id is required!');
  });

  it('generateSecondCopy — POST v1 ConsultaLinhaDigitavelBoleto, mapeia campos com fallback', async () => {
    const http = makeHttp({
      boleto_url: 'https://boleto.rbx',
      pix: 'pix-rbx-code',
      barcode: '11111.22222',
      vencimento: '2026-11-15',
      valor: '89,90',
    });
    const adapter = new RBXAdapter(creds, http);
    const result = await adapter.generateSecondCopy('1', '12345');
    expect(http).toHaveBeenCalledWith(V1, expect.objectContaining({
      body: JSON.stringify({
        ConsultaLinhaDigitavelBoleto: {
          Autenticacao: { ChaveIntegracao: 'chave-integracao-123' },
          DadosLinhaDigitavelEntrada: { Tipo: 'C', CliFor: 1, Documento: 12345 },
        },
      }),
    }));
    expect(result.boletoUrl).toBe('https://boleto.rbx');
    expect(result.pixCopiaCola).toBe('pix-rbx-code');
    expect(result.barcode).toBe('11111.22222');
    expect(result.amountCents).toBe(8990);
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
