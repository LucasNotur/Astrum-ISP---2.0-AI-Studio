import { describe, it, expect, vi } from 'vitest';
import { VoalleAdapter } from './voalle.adapter';
import type { HttpClient } from './erp.types';

function makeHttp(data: unknown, ok = true): HttpClient {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 422,
    statusText: ok ? 'OK' : 'Unprocessable Entity',
    json: async () => data,
  });
}

const creds = { url: 'https://api.voalle.test', token: 'bearer-tok' };

describe('VoalleAdapter', () => {
  it('lança se url ou token ausentes', () => {
    expect(() => new VoalleAdapter({ url: '', token: 'x' })).toThrow('Voalle: credenciais ausentes');
    expect(() => new VoalleAdapter({ url: 'http://x', token: '' })).toThrow('Voalle: credenciais ausentes');
  });

  it('findCustomerByCpf — remove máscara e monta URL correta', async () => {
    const http = makeHttp([{ id: 1, nome: 'João' }]);
    const adapter = new VoalleAdapter(creds, http);
    const result = await adapter.findCustomerByCpf('123.456.789-00');
    expect(http).toHaveBeenCalledWith(
      'https://api.voalle.test/v1/clientes?cpf=12345678900&limit=5',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual([{ id: 1, nome: 'João' }]);
  });

  it('getBillingStatus — query com status=aberto', async () => {
    const http = makeHttp([{ id: 'fatura-1', valor: '99,90' }]);
    const adapter = new VoalleAdapter(creds, http);
    await adapter.getBillingStatus('cid-1');
    expect(http).toHaveBeenCalledWith(
      'https://api.voalle.test/v1/financeiro/titulos?cliente_id=cid-1&status=aberto&limit=10',
      expect.anything(),
    );
  });

  it('generateSecondCopy — mapeia campos Voalle para SecondCopyResult', async () => {
    const http = makeHttp({
      boleto_url: 'https://boleto.test',
      pix_copia_cola: 'pix123',
      linha_digitavel: '34191.75301',
      data_vencimento: '2026-08-01',
      valor: '1.234,56',
    });
    const adapter = new VoalleAdapter(creds, http);
    const result = await adapter.generateSecondCopy('cid-1', 'inv-1');
    expect(result.boletoUrl).toBe('https://boleto.test');
    expect(result.pixCopiaCola).toBe('pix123');
    expect(result.barcode).toBe('34191.75301');
    expect(result.dueDate).toBe('2026-08-01');
    expect(result.amountCents).toBe(123456);
  });

  it('getConnectionStatus — ativo = true quando status=ativo', async () => {
    const http = makeHttp({ status: 'ativo' });
    const adapter = new VoalleAdapter(creds, http);
    const result = await adapter.getConnectionStatus('cid-1');
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando status diferente', async () => {
    const http = makeHttp({ status: 'bloqueado' });
    const adapter = new VoalleAdapter(creds, http);
    const result = await adapter.getConnectionStatus('cid-1');
    expect(result.online).toBe(false);
  });

  it('unlockCustomer — faz POST no endpoint correto', async () => {
    const http = makeHttp({ ok: true });
    const adapter = new VoalleAdapter(creds, http);
    await adapter.unlockCustomer('cid-1');
    expect(http).toHaveBeenCalledWith(
      'https://api.voalle.test/v1/clientes/cid-1/desbloqueio',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('lança quando API responde !ok', async () => {
    const http = makeHttp({ error: 'not found' }, false);
    const adapter = new VoalleAdapter(creds, http);
    await expect(adapter.findCustomerByCpf('12345678900')).rejects.toThrow('Voalle API Error: 422');
  });

  it('usa Authorization Bearer no header', async () => {
    const http = makeHttp({});
    const adapter = new VoalleAdapter(creds, http);
    await adapter.findCustomerByCpf('00000000000');
    const init = (http as any).mock.calls[0][1];
    expect(init.headers['Authorization']).toBe('Bearer bearer-tok');
  });

  // ── OAuth client_credentials (fluxo do wizard/SettingsPage) ─────────────────
  const oauthCreds = { url: 'https://api.voalle.test', clientId: 'cid-x', clientSecret: 'secret-y' };

  it('aceita credenciais OAuth (clientId + clientSecret) sem token', () => {
    expect(() => new VoalleAdapter(oauthCreds)).not.toThrow();
  });

  it('lança se não há token nem par clientId/clientSecret', () => {
    expect(() => new VoalleAdapter({ url: 'https://x', clientId: 'só-id' } as any)).toThrow(
      'Voalle: credenciais ausentes',
    );
  });

  it('OAuth — faz token-exchange e usa o access_token nas chamadas', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ access_token: 'oauth-tok-123', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => [{ id: 1 }],
      }) as unknown as HttpClient;

    const adapter = new VoalleAdapter(oauthCreds, http);
    const result = await adapter.findCustomerByCpf('12345678900');

    // 1ª chamada: token-exchange em /oauth/token com grant client_credentials.
    expect((http as any).mock.calls[0][0]).toBe('https://api.voalle.test/oauth/token');
    const tokenInit = (http as any).mock.calls[0][1];
    expect(tokenInit.method).toBe('POST');
    expect(JSON.parse(tokenInit.body)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'cid-x',
      client_secret: 'secret-y',
    });

    // 2ª chamada: request de negócio com o Bearer obtido.
    expect((http as any).mock.calls[1][0]).toBe('https://api.voalle.test/v1/clientes?cpf=12345678900&limit=5');
    expect((http as any).mock.calls[1][1].headers['Authorization']).toBe('Bearer oauth-tok-123');
    expect(result).toEqual([{ id: 1 }]);
  });

  it('OAuth — cacheia o token entre chamadas (um único token-exchange)', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ access_token: 'oauth-tok-123', expires_in: 3600 }),
      })
      .mockResolvedValue({
        ok: true, status: 200, statusText: 'OK',
        json: async () => [],
      }) as unknown as HttpClient;

    const adapter = new VoalleAdapter(oauthCreds, http);
    await adapter.findCustomerByCpf('11111111111');
    await adapter.getBillingStatus('cid-1');

    const oauthCalls = (http as any).mock.calls.filter((c: any[]) => c[0].endsWith('/oauth/token'));
    expect(oauthCalls).toHaveLength(1);
  });

  it('OAuth — lança se o token-exchange falha', async () => {
    const http = makeHttp({ error: 'invalid_client' }, false);
    const adapter = new VoalleAdapter(oauthCreds, http);
    await expect(adapter.findCustomerByCpf('00000000000')).rejects.toThrow('Voalle OAuth Error: 422');
  });

  it('OAuth — lança se a resposta não traz access_token', async () => {
    const http = makeHttp({ foo: 'bar' });
    const adapter = new VoalleAdapter(oauthCreds, http);
    await expect(adapter.findCustomerByCpf('00000000000')).rejects.toThrow('resposta sem access_token');
  });

  // ── tokenCache compartilhado (Redis) — sobrevive a instâncias novas por chamada ──
  it('tokenCache — usa o token cacheado sem fazer novo token-exchange', async () => {
    const http = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      json: async () => [{ id: 1 }],
    }) as unknown as HttpClient;
    const tokenCache = { get: vi.fn().mockResolvedValue('cached-tok'), set: vi.fn() };

    const adapter = new VoalleAdapter(oauthCreds, http, tokenCache as any);
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

    const adapter = new VoalleAdapter(oauthCreds, http, tokenCache as any);
    await adapter.findCustomerByCpf('00000000000');

    expect(tokenCache.set).toHaveBeenCalledWith('fresh-tok', 3540);
  });
});
