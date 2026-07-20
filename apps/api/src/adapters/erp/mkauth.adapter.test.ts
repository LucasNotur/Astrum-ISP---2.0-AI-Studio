import { describe, it, expect, vi } from 'vitest';
import { MKAuthAdapter } from './mkauth.adapter';
import type { HttpClient } from './erp.types';

function makeHttp(data: unknown, ok = true): HttpClient {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => data,
  });
}

const creds = { url: 'https://mk.isp.test', token: 'mk-key-abc' };

describe('MKAuthAdapter', () => {
  it('lança se url ou token ausentes', () => {
    expect(() => new MKAuthAdapter({ url: '', token: 'x' })).toThrow('MK-Auth: credenciais ausentes');
    expect(() => new MKAuthAdapter({ url: 'http://x', token: '' })).toThrow('MK-Auth: credenciais ausentes');
  });

  it('usa header MK-Auth-Key — não Bearer', async () => {
    const http = makeHttp([]);
    const adapter = new MKAuthAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    const init = (http as any).mock.calls[0][1];
    expect(init.headers['MK-Auth-Key']).toBe('mk-key-abc');
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('findCustomerByCpf — remove máscara CPF', async () => {
    const http = makeHttp([]);
    const adapter = new MKAuthAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    expect(http).toHaveBeenCalledWith(
      'https://mk.isp.test/api/cliente?cliente_cpf=11122233344',
      expect.anything(),
    );
  });

  it('generateSecondCopy — mapeia campos MK-Auth', async () => {
    const http = makeHttp({
      registros: [{
        id: 'bol-1',
        url: 'https://boleto.mk',
        pix: 'pix-mk',
        linhadigitavel: '77777.88888',
        datavenc: '2026-08-20',
        valor: '119,90',
      }],
    });
    const adapter = new MKAuthAdapter(creds, http);
    const result = await adapter.generateSecondCopy('c1', 'bol-1');
    expect(result.boletoUrl).toBe('https://boleto.mk');
    expect(result.pixCopiaCola).toBe('pix-mk');
    expect(result.barcode).toBe('77777.88888');
    expect(result.amountCents).toBe(11990);
  });

  it('getConnectionStatus — ativo quando login=ativo', async () => {
    const http = makeHttp([{ login: 'ativo' }]);
    const adapter = new MKAuthAdapter(creds, http);
    const result = await adapter.getConnectionStatus('c1');
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando login!=ativo', async () => {
    const http = makeHttp([{ login: 'bloqueado', status: 'inativo' }]);
    const adapter = new MKAuthAdapter(creds, http);
    const result = await adapter.getConnectionStatus('c1');
    expect(result.online).toBe(false);
  });

  it('lança quando API responde !ok', async () => {
    const http = makeHttp({}, false);
    const adapter = new MKAuthAdapter(creds, http);
    await expect(adapter.getBillingStatus('c1')).rejects.toThrow('MK-Auth API Error: 500');
  });
});
