import { describe, it, expect, vi } from 'vitest';
import { HubsoftAdapter } from './hubsoft.adapter';
import type { HttpClient } from './erp.types';

function makeHttp(data: unknown, ok = true): HttpClient {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 422,
    statusText: ok ? 'OK' : 'Unprocessable Entity',
    json: async () => data,
  });
}

const creds = { url: 'https://hubsoft.isp.test', token: 'hs-token' };

describe('HubsoftAdapter', () => {
  it('lança se url ou token ausentes', () => {
    expect(() => new HubsoftAdapter({ url: '', token: 'x' })).toThrow('Hubsoft: credenciais ausentes');
  });

  it('usa Authorization Bearer', async () => {
    const http = makeHttp([]);
    const adapter = new HubsoftAdapter(creds, http);
    await adapter.findCustomerByCpf('000');
    const init = (http as any).mock.calls[0][1];
    expect(init.headers['Authorization']).toBe('Bearer hs-token');
  });

  it('findCustomerByCpf — monta URL com cpf_cnpj limpo', async () => {
    const http = makeHttp([]);
    const adapter = new HubsoftAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    expect(http).toHaveBeenCalledWith(
      'https://hubsoft.isp.test/api/v1/clientes?cpf_cnpj=11122233344&per_page=5',
      expect.anything(),
    );
  });

  it('generateSecondCopy — extrai campos do objeto boleto aninhado', async () => {
    const http = makeHttp({
      boleto: { url: 'https://boleto.hs', linha_digitavel: '76091.75301' },
      pix: { copia_cola: 'pix-hs-123' },
      data_vencimento: '2026-10-15',
      valor: '250,00',
    });
    const adapter = new HubsoftAdapter(creds, http);
    const result = await adapter.generateSecondCopy('cid-1', 'inv-1');
    expect(result.boletoUrl).toBe('https://boleto.hs');
    expect(result.pixCopiaCola).toBe('pix-hs-123');
    expect(result.barcode).toBe('76091.75301');
    expect(result.amountCents).toBe(25000);
  });

  it('getConnectionStatus — detecta online por conectado=true', async () => {
    const http = makeHttp({ conectado: true });
    const adapter = new HubsoftAdapter(creds, http);
    const result = await adapter.getConnectionStatus('cid-1');
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando todos os flags ausentes/false', async () => {
    const http = makeHttp({ conectado: false, ativo: false, status: 'bloqueado' });
    const adapter = new HubsoftAdapter(creds, http);
    const result = await adapter.getConnectionStatus('cid-1');
    expect(result.online).toBe(false);
  });

  it('lança quando API responde !ok', async () => {
    const http = makeHttp({}, false);
    const adapter = new HubsoftAdapter(creds, http);
    await expect(adapter.unlockCustomer('c1')).rejects.toThrow('Hubsoft API Error: 422');
  });
});
