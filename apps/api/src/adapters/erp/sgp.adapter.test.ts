import { describe, it, expect, vi } from 'vitest';
import { SGPAdapter } from './sgp.adapter';
import type { HttpClient } from './erp.types';

function makeHttp(data: unknown, ok = true): HttpClient {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => data,
  });
}

const creds = { url: 'https://sgp.isp.test', token: 'sgp-token-abc' };

describe('SGPAdapter', () => {
  it('lança se url ou token ausentes', () => {
    expect(() => new SGPAdapter({ url: '', token: 'x' })).toThrow('SGP: credenciais ausentes');
    expect(() => new SGPAdapter({ url: 'http://x', token: '' })).toThrow('SGP: credenciais ausentes');
  });

  it('usa header token (API Key) — não Bearer', async () => {
    const http = makeHttp([]);
    const adapter = new SGPAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    const init = (http as any).mock.calls[0][1];
    expect(init.headers['token']).toBe('sgp-token-abc');
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('findCustomerByCpf — remove máscara CPF na URL', async () => {
    const http = makeHttp([]);
    const adapter = new SGPAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    expect(http).toHaveBeenCalledWith(
      'https://sgp.isp.test/api/v2/contratos?cpf=11122233344&limit=5',
      expect.anything(),
    );
  });

  it('generateSecondCopy — mapeia campos SGP', async () => {
    const http = makeHttp({
      link: 'https://boleto.sgp',
      qrcode: 'qr-pix',
      linha: '12345.67890',
      vencimento: '2026-09-01',
      valor: '199,00',
    });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.generateSecondCopy('contrato-1', 'fatura-1');
    expect(result.boletoUrl).toBe('https://boleto.sgp');
    expect(result.pixCopiaCola).toBe('qr-pix');
    expect(result.barcode).toBe('12345.67890');
    expect(result.amountCents).toBe(19900);
  });

  it('getConnectionStatus — status ativo detectado pelo campo ativo=true', async () => {
    const http = makeHttp({ ativo: true });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.getConnectionStatus('cid-1');
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando ativo=false', async () => {
    const http = makeHttp({ ativo: false, status: 'suspenso' });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.getConnectionStatus('cid-1');
    expect(result.online).toBe(false);
  });

  it('lança quando API responde !ok', async () => {
    const http = makeHttp({}, false);
    const adapter = new SGPAdapter(creds, http);
    await expect(adapter.getBillingStatus('c1')).rejects.toThrow('SGP API Error: 500');
  });
});
