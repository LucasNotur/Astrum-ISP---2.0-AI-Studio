import { describe, it, expect, vi } from 'vitest';
import { RadiusNetAdapter } from './radiusnet.adapter';
import type { HttpClient } from './erp.types';

function makeHttp(data: unknown, ok = true): HttpClient {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => data,
  });
}

const creds = { url: 'https://radius.isp.test', token: 'rn-token-123' };

describe('RadiusNetAdapter', () => {
  it('lança se url ou token ausentes', () => {
    expect(() => new RadiusNetAdapter({ url: '', token: 'x' })).toThrow('RadiusNet: credenciais ausentes');
    expect(() => new RadiusNetAdapter({ url: 'http://x', token: '' })).toThrow('RadiusNet: credenciais ausentes');
  });

  it('usa Bearer token no header', async () => {
    const http = makeHttp([]);
    const adapter = new RadiusNetAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    const init = (http as any).mock.calls[0][1];
    expect(init.headers['Authorization']).toBe('Bearer rn-token-123');
  });

  it('findCustomerByCpf — remove máscara CPF', async () => {
    const http = makeHttp([]);
    const adapter = new RadiusNetAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    expect(http).toHaveBeenCalledWith(
      'https://radius.isp.test/api/clientes?cpf=11122233344',
      expect.anything(),
    );
  });

  it('generateSecondCopy — mapeia campos RadiusNet', async () => {
    const http = makeHttp({
      boleto_url: 'https://boleto.rn',
      pix_copia_cola: 'pix-code',
      linha_digitavel: '99999.99999',
      vencimento: '2026-10-01',
      valor: '149,90',
    });
    const adapter = new RadiusNetAdapter(creds, http);
    const result = await adapter.generateSecondCopy('c1', 'f1');
    expect(result.boletoUrl).toBe('https://boleto.rn');
    expect(result.pixCopiaCola).toBe('pix-code');
    expect(result.amountCents).toBe(14990);
  });

  it('getConnectionStatus — online quando status=online', async () => {
    const http = makeHttp({ status: 'online' });
    const adapter = new RadiusNetAdapter(creds, http);
    const result = await adapter.getConnectionStatus('login-1');
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando status=bloqueado', async () => {
    const http = makeHttp({ status: 'bloqueado' });
    const adapter = new RadiusNetAdapter(creds, http);
    const result = await adapter.getConnectionStatus('login-1');
    expect(result.online).toBe(false);
  });

  it('lança quando API responde !ok', async () => {
    const http = makeHttp({}, false);
    const adapter = new RadiusNetAdapter(creds, http);
    await expect(adapter.getBillingStatus('c1')).rejects.toThrow('RadiusNet API Error: 500');
  });

  it('remove trailing slash da URL base', async () => {
    const http = makeHttp([]);
    const adapter = new RadiusNetAdapter({ url: 'https://radius.isp.test/', token: 'x' }, http);
    await adapter.findCustomerByCpf('12345678900');
    expect(http).toHaveBeenCalledWith(
      'https://radius.isp.test/api/clientes?cpf=12345678900',
      expect.anything(),
    );
  });
});
