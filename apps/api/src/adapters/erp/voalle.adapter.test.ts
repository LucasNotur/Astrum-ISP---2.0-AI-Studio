import { describe, it, expect, vi } from 'vitest';
import { VoalleAdapter } from './voalle.adapter';
import type { HttpClient } from './erp.types';

function makeHttp(response: unknown, ok = true): HttpClient {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 422,
    statusText: ok ? 'OK' : 'Unprocessable Entity',
    json: async () => (ok ? { success: true, messages: [], response } : response),
  });
}

const creds = { url: 'https://erp.voalle.test', token: 'bearer-tok' };
const API = 'https://erp.voalle.test:45715';
const AUTH = 'https://erp.voalle.test:45700';

describe('VoalleAdapter', () => {
  it('lança se url ausente ou sem token nem clientId/clientSecret/syndata', () => {
    expect(() => new VoalleAdapter({ url: '', token: 'x' })).toThrow('Voalle: credenciais ausentes');
    expect(() => new VoalleAdapter({ url: 'http://x', token: '' })).toThrow('Voalle: credenciais ausentes');
  });

  it('findCustomerByCpf — remove máscara, monta URL na porta 45715 e devolve .response', async () => {
    const http = makeHttp({ id: 1, name: 'João' });
    const adapter = new VoalleAdapter(creds, http);
    const result = await adapter.findCustomerByCpf('123.456.789-00');
    expect(http).toHaveBeenCalledWith(
      `${API}/external/integrations/thirdparty/people/txid/12345678900`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({ id: 1, name: 'João' });
  });

  it('getBillingStatus — consulta títulos em aberto por CPF', async () => {
    const http = makeHttp([{ id: 'fatura-1' }]);
    const adapter = new VoalleAdapter(creds, http);
    await adapter.getBillingStatus('11122233344');
    expect(http).toHaveBeenCalledWith(
      `${API}/external/integrations/thirdparty/getopentitlesbytxid/11122233344`,
      expect.anything(),
    );
  });

  it('generateSecondCopy — acha a fatura na lista completa e mapeia campos do billet', async () => {
    const http = makeHttp([
      { id: 'inv-outro', billet: { typefulLine: 'x' } },
      {
        id: 'inv-1',
        billet: {
          typefulLine: '34191.75301',
          pixQRCode: 'pix123',
          expirationDate: '2026-08-01',
          amount: { value: 1234.56, finalValue: 1234.56 },
        },
      },
    ]);
    const adapter = new VoalleAdapter(creds, http);
    const result = await adapter.generateSecondCopy('11122233344', 'inv-1');
    expect(http).toHaveBeenCalledWith(
      `${API}/external/integrations/thirdparty/gettitlesbytxid/11122233344`,
      expect.anything(),
    );
    expect(result.boletoUrl).toBe('');
    expect(result.pixCopiaCola).toBe('pix123');
    expect(result.barcode).toBe('34191.75301');
    expect(result.dueDate).toBe('2026-08-01');
    expect(result.amountCents).toBe(123456);
  });

  it('generateSecondCopy — lança quando a fatura não está na lista', async () => {
    const http = makeHttp([{ id: 'outra' }]);
    const adapter = new VoalleAdapter(creds, http);
    await expect(adapter.generateSecondCopy('11122233344', 'inv-1')).rejects.toThrow('fatura inv-1 não encontrada');
  });

  it('getConnectionStatus — resolve id numérico via people/txid, depois consulta access points', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true, messages: [], response: { id: 42 } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true, messages: [], response: [{ active: true }] }) }) as unknown as HttpClient;

    const adapter = new VoalleAdapter(creds, http);
    const result = await adapter.getConnectionStatus('11122233344');

    expect((http as any).mock.calls[0][0]).toBe(`${API}/external/integrations/thirdparty/people/txid/11122233344`);
    expect((http as any).mock.calls[1][0]).toBe(`${API}/external/integrations/thirdparty/getaccesspointstatusbyclient/42`);
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando algum access point não está ativo', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true, messages: [], response: { id: 42 } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ success: true, messages: [], response: [{ active: true }, { active: false }] }) }) as unknown as HttpClient;

    const adapter = new VoalleAdapter(creds, http);
    const result = await adapter.getConnectionStatus('11122233344');
    expect(result.online).toBe(false);
  });

  it('getConnectionStatus — lança se o cliente não é encontrado (sem id)', async () => {
    const http = makeHttp(null);
    const adapter = new VoalleAdapter(creds, http);
    await expect(adapter.getConnectionStatus('11122233344')).rejects.toThrow('não encontrado');
  });

  it('unlockCustomer — POST em contracts/unlock com o número do contrato (não CPF)', async () => {
    const http = makeHttp({ ok: true });
    const adapter = new VoalleAdapter(creds, http);
    await adapter.unlockCustomer('CTR-123');
    expect(http).toHaveBeenCalledWith(
      `${API}/external/integrations/thirdparty/contracts/unlock/CTR-123`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('lança quando API responde !ok', async () => {
    const http = makeHttp({ error: 'not found' }, false);
    const adapter = new VoalleAdapter(creds, http);
    await expect(adapter.findCustomerByCpf('12345678900')).rejects.toThrow('Voalle API Error: 422');
  });

  it('usa Authorization Bearer no header (token pré-gerado)', async () => {
    const http = makeHttp({});
    const adapter = new VoalleAdapter(creds, http);
    await adapter.findCustomerByCpf('00000000000');
    const init = (http as any).mock.calls[0][1];
    expect(init.headers['Authorization']).toBe('Bearer bearer-tok');
  });

  // ── OAuth client_credentials (form-urlencoded, porta de auth separada) ──────
  const oauthCreds = { url: 'https://erp.voalle.test', clientId: 'cid-x', clientSecret: 'secret-y', syndata: 'syn-z' };

  it('aceita credenciais OAuth (clientId + clientSecret + syndata) sem token', () => {
    expect(() => new VoalleAdapter(oauthCreds)).not.toThrow();
  });

  it('lança se não há token nem o trio clientId/clientSecret/syndata completo', () => {
    expect(() => new VoalleAdapter({ url: 'https://x', clientId: 'só-id', clientSecret: 'y' } as any)).toThrow(
      'Voalle: credenciais ausentes',
    );
  });

  it('OAuth — faz token-exchange form-urlencoded em /connect/token na porta de auth', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ access_token: 'oauth-tok-123', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ success: true, messages: [], response: { id: 1 } }),
      }) as unknown as HttpClient;

    const adapter = new VoalleAdapter(oauthCreds, http);
    const result = await adapter.findCustomerByCpf('12345678900');

    expect((http as any).mock.calls[0][0]).toBe(`${AUTH}/connect/token`);
    const tokenInit = (http as any).mock.calls[0][1];
    expect(tokenInit.method).toBe('POST');
    expect(tokenInit.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(tokenInit.body);
    expect(form.get('grant_type')).toBe('client_credentials');
    expect(form.get('scope')).toBe('syngw');
    expect(form.get('client_id')).toBe('cid-x');
    expect(form.get('client_secret')).toBe('secret-y');
    expect(form.get('syndata')).toBe('syn-z');

    expect((http as any).mock.calls[1][0]).toBe(`${API}/external/integrations/thirdparty/people/txid/12345678900`);
    expect((http as any).mock.calls[1][1].headers['Authorization']).toBe('Bearer oauth-tok-123');
    expect(result).toEqual({ id: 1 });
  });

  it('OAuth — cacheia o token entre chamadas (um único token-exchange)', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ access_token: 'oauth-tok-123', expires_in: 3600 }),
      })
      .mockResolvedValue({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ success: true, messages: [], response: [] }),
      }) as unknown as HttpClient;

    const adapter = new VoalleAdapter(oauthCreds, http);
    await adapter.findCustomerByCpf('11111111111');
    await adapter.getBillingStatus('11111111111');

    const oauthCalls = (http as any).mock.calls.filter((c: any[]) => c[0].endsWith('/connect/token'));
    expect(oauthCalls).toHaveLength(1);
  });

  it('OAuth — lança se o token-exchange falha', async () => {
    const http = makeHttp({ error: 'invalid_client' }, false);
    const adapter = new VoalleAdapter(oauthCreds, http);
    await expect(adapter.findCustomerByCpf('00000000000')).rejects.toThrow('Voalle OAuth Error: 422');
  });

  it('OAuth — lança se a resposta não traz access_token', async () => {
    const http = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({ foo: 'bar' }) }) as unknown as HttpClient;
    const adapter = new VoalleAdapter(oauthCreds, http);
    await expect(adapter.findCustomerByCpf('00000000000')).rejects.toThrow('resposta sem access_token');
  });

  // ── tokenCache compartilhado (Redis) — sobrevive a instâncias novas por chamada ──
  it('tokenCache — usa o token cacheado sem fazer novo token-exchange', async () => {
    const http = makeHttp({ id: 1 });
    const tokenCache = { get: vi.fn().mockResolvedValue('cached-tok'), set: vi.fn() };

    const adapter = new VoalleAdapter(oauthCreds, http, tokenCache as any);
    await adapter.findCustomerByCpf('00000000000');

    expect(tokenCache.get).toHaveBeenCalled();
    expect((http as any).mock.calls[0][1].headers['Authorization']).toBe('Bearer cached-tok');
    expect((http as any).mock.calls.some((c: any[]) => c[0].endsWith('/connect/token'))).toBe(false);
  });

  it('tokenCache — grava o token novo após o token-exchange', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ access_token: 'fresh-tok', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({ success: true, messages: [], response: [] }),
      }) as unknown as HttpClient;
    const tokenCache = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };

    const adapter = new VoalleAdapter(oauthCreds, http, tokenCache as any);
    await adapter.findCustomerByCpf('00000000000');

    expect(tokenCache.set).toHaveBeenCalledWith('fresh-tok', 3540);
  });
});
