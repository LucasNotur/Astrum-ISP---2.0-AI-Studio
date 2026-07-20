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

const creds = { url: 'https://rbx.isp.test', token: 'user:pass123' };

describe('RBXAdapter', () => {
  it('lança se url ou token ausentes', () => {
    expect(() => new RBXAdapter({ url: '', token: 'x' })).toThrow('RBX: credenciais ausentes');
    expect(() => new RBXAdapter({ url: 'http://x', token: '' })).toThrow('RBX: credenciais ausentes');
  });

  it('usa Basic auth com token em base64', async () => {
    const http = makeHttp([]);
    const adapter = new RBXAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    const init = (http as any).mock.calls[0][1];
    const expected = Buffer.from('user:pass123').toString('base64');
    expect(init.headers['Authorization']).toBe(`Basic ${expected}`);
  });

  it('findCustomerByCpf — remove máscara CPF', async () => {
    const http = makeHttp({ id: 1, nome: 'João' });
    const adapter = new RBXAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    expect(http).toHaveBeenCalledWith(
      'https://rbx.isp.test/api/v1/cliente?cpf=11122233344',
      expect.anything(),
    );
  });

  it('generateSecondCopy — mapeia campos RBX', async () => {
    const http = makeHttp({
      link: 'https://boleto.rbx',
      pix: 'pix-rbx-code',
      barcode: '11111.22222',
      vencimento: '2026-11-15',
      valor: '89,90',
    });
    const adapter = new RBXAdapter(creds, http);
    const result = await adapter.generateSecondCopy('c1', 't1');
    expect(result.boletoUrl).toBe('https://boleto.rbx');
    expect(result.pixCopiaCola).toBe('pix-rbx-code');
    expect(result.barcode).toBe('11111.22222');
    expect(result.amountCents).toBe(8990);
  });

  it('getConnectionStatus — ativo=true detecta online', async () => {
    const http = makeHttp({ ativo: true });
    const adapter = new RBXAdapter(creds, http);
    const result = await adapter.getConnectionStatus('c1');
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando ativo=false', async () => {
    const http = makeHttp({ ativo: false, status: 'suspenso' });
    const adapter = new RBXAdapter(creds, http);
    const result = await adapter.getConnectionStatus('c1');
    expect(result.online).toBe(false);
  });

  it('unlockCustomer — POST com cliente_id no body', async () => {
    const http = makeHttp({ success: true });
    const adapter = new RBXAdapter(creds, http);
    await adapter.unlockCustomer('c42');
    expect(http).toHaveBeenCalledWith(
      'https://rbx.isp.test/api/v1/cliente/desbloquear',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ cliente_id: 'c42' }),
      }),
    );
  });

  it('lança quando API responde !ok', async () => {
    const http = makeHttp({}, false);
    const adapter = new RBXAdapter(creds, http);
    await expect(adapter.getBillingStatus('c1')).rejects.toThrow('RBX API Error: 500');
  });
});
