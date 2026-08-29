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

  // ── OAuth password grant (fluxo do wizard/SettingsPage) ─────────────────────
  const oauthCreds = {
    url: 'https://hubsoft.isp.test',
    clientId: 'cid-x',
    clientSecret: 'secret-y',
    username: 'api@hubsoft.com.br',
    password: 'api123api',
  };

  it('aceita credenciais OAuth (clientId/clientSecret/username/password) sem token', () => {
    expect(() => new HubsoftAdapter(oauthCreds)).not.toThrow();
  });

  it('lança se não há token nem o conjunto OAuth completo', () => {
    expect(() =>
      new HubsoftAdapter({ url: 'https://x', clientId: 'só-id', clientSecret: 'y' } as any),
    ).toThrow('Hubsoft: credenciais ausentes');
  });

  it('OAuth — faz token-exchange com grant_type password e usa o access_token nas chamadas', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ access_token: 'oauth-tok-123', expires_in: 2592000 }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => [{ id: 1 }],
      }) as unknown as HttpClient;

    const adapter = new HubsoftAdapter(oauthCreds, http);
    const result = await adapter.findCustomerByCpf('12345678900');

    expect((http as any).mock.calls[0][0]).toBe('https://hubsoft.isp.test/oauth/token');
    const tokenInit = (http as any).mock.calls[0][1];
    expect(tokenInit.method).toBe('POST');
    expect(JSON.parse(tokenInit.body)).toEqual({
      grant_type: 'password',
      client_id: 'cid-x',
      client_secret: 'secret-y',
      username: 'api@hubsoft.com.br',
      password: 'api123api',
    });

    expect((http as any).mock.calls[1][0]).toBe(
      'https://hubsoft.isp.test/api/v1/clientes?cpf_cnpj=12345678900&per_page=5',
    );
    expect((http as any).mock.calls[1][1].headers['Authorization']).toBe('Bearer oauth-tok-123');
    expect(result).toEqual([{ id: 1 }]);
  });

  it('OAuth — cacheia o token entre chamadas (um único token-exchange)', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ access_token: 'oauth-tok-123', expires_in: 2592000 }),
      })
      .mockResolvedValue({
        ok: true, status: 200, statusText: 'OK',
        json: async () => [],
      }) as unknown as HttpClient;

    const adapter = new HubsoftAdapter(oauthCreds, http);
    await adapter.findCustomerByCpf('11111111111');
    await adapter.getBillingStatus('cid-1');

    const oauthCalls = (http as any).mock.calls.filter((c: any[]) => c[0].endsWith('/oauth/token'));
    expect(oauthCalls).toHaveLength(1);
  });

  it('OAuth — lança se o token-exchange falha', async () => {
    const http = makeHttp({ error: 'invalid_credentials' }, false);
    const adapter = new HubsoftAdapter(oauthCreds, http);
    await expect(adapter.findCustomerByCpf('00000000000')).rejects.toThrow('Hubsoft OAuth Error: 422');
  });

  it('OAuth — lança se a resposta não traz access_token', async () => {
    const http = makeHttp({ foo: 'bar' });
    const adapter = new HubsoftAdapter(oauthCreds, http);
    await expect(adapter.findCustomerByCpf('00000000000')).rejects.toThrow('resposta sem access_token');
  });

  // ── tokenCache compartilhado (Redis) — sobrevive a instâncias novas por chamada ──
  it('tokenCache — usa o token cacheado sem fazer novo token-exchange', async () => {
    const http = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      json: async () => [{ id: 1 }],
    }) as unknown as HttpClient;
    const tokenCache = { get: vi.fn().mockResolvedValue('cached-tok'), set: vi.fn() };

    const adapter = new HubsoftAdapter(oauthCreds, http, tokenCache as any);
    await adapter.findCustomerByCpf('00000000000');

    expect(tokenCache.get).toHaveBeenCalled();
    expect((http as any).mock.calls[0][1].headers['Authorization']).toBe('Bearer cached-tok');
    expect((http as any).mock.calls.some((c: any[]) => c[0].endsWith('/oauth/token'))).toBe(false);
  });

  it('tokenCache — grava o token novo após o token-exchange', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ access_token: 'fresh-tok', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => [],
      }) as unknown as HttpClient;
    const tokenCache = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };

    const adapter = new HubsoftAdapter(oauthCreds, http, tokenCache as any);
    await adapter.findCustomerByCpf('00000000000');

    expect(tokenCache.set).toHaveBeenCalledWith('fresh-tok', 3540);
  });
});
