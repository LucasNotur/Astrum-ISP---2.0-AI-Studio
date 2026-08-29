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

  it('findCustomerByCpf — monta URL com busca=cpf_cnpj e cpf limpo', async () => {
    const http = makeHttp({ clientes: [] });
    const adapter = new HubsoftAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    expect(http).toHaveBeenCalledWith(
      'https://hubsoft.isp.test/api/v1/integracao/cliente?busca=cpf_cnpj&termo_busca=11122233344',
      expect.anything(),
    );
  });

  it('getBillingStatus — consulta financeiro por id_cliente_servico', async () => {
    const http = makeHttp({ faturas: [] });
    const adapter = new HubsoftAdapter(creds, http);
    await adapter.getBillingStatus('18659');
    expect(http).toHaveBeenCalledWith(
      'https://hubsoft.isp.test/api/v1/integracao/cliente/financeiro?busca=id_cliente_servico&termo_busca=18659&apenas_pendente=sim',
      expect.anything(),
    );
  });

  it('generateSecondCopy — acha a fatura certa na lista (boleto/pix já vêm prontos, sem endpoint de geração)', async () => {
    const http = makeHttp({
      faturas: [
        { id_fatura: 111, link: 'https://boleto.hs/1', linha_digitavel: '111.111', pix_copia_cola: 'pix-1', valor: 50, data_vencimento: '01/01/2026' },
        { id_fatura: 222, link: 'https://boleto.hs/2', linha_digitavel: '76091.75301', pix_copia_cola: 'pix-hs-123', valor: 250, data_vencimento: '15/10/2026' },
      ],
    });
    const adapter = new HubsoftAdapter(creds, http);
    const result = await adapter.generateSecondCopy('cid-1', '222');
    expect(result.boletoUrl).toBe('https://boleto.hs/2');
    expect(result.pixCopiaCola).toBe('pix-hs-123');
    expect(result.barcode).toBe('76091.75301');
    expect(result.dueDate).toBe('15/10/2026');
    expect(result.amountCents).toBe(25000);
  });

  it('generateSecondCopy — lança quando a fatura não está na lista (não manda a de outro cliente)', async () => {
    const http = makeHttp({ faturas: [{ id_fatura: 111, valor: 50 }] });
    const adapter = new HubsoftAdapter(creds, http);
    await expect(adapter.generateSecondCopy('cid-1', '999')).rejects.toThrow('fatura 999 não encontrada');
  });

  it('getConnectionStatus — detecta online via servicos[].ultima_conexao.conectado', async () => {
    const http = makeHttp({
      clientes: [{ servicos: [{ id_cliente_servico: '18659', ultima_conexao: { conectado: true } }] }],
    });
    const adapter = new HubsoftAdapter(creds, http);
    const result = await adapter.getConnectionStatus('18659');
    expect(http).toHaveBeenCalledWith(
      'https://hubsoft.isp.test/api/v1/integracao/cliente?busca=id_cliente_servico&termo_busca=18659&ultima_conexao=sim',
      expect.anything(),
    );
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando conectado=false', async () => {
    const http = makeHttp({
      clientes: [{ servicos: [{ id_cliente_servico: '18659', ultima_conexao: { conectado: false } }] }],
    });
    const adapter = new HubsoftAdapter(creds, http);
    const result = await adapter.getConnectionStatus('18659');
    expect(result.online).toBe(false);
  });

  it('getConnectionStatus — lança se o serviço não aparece na resposta', async () => {
    const http = makeHttp({ clientes: [{ servicos: [{ id_cliente_servico: 'outro' }] }] });
    const adapter = new HubsoftAdapter(creds, http);
    await expect(adapter.getConnectionStatus('18659')).rejects.toThrow('serviço 18659 não encontrado');
  });

  it('unlockCustomer — POST desbloqueio_confianca com id_cliente_servico', async () => {
    const http = makeHttp({ status: 'success' });
    const adapter = new HubsoftAdapter(creds, http);
    await adapter.unlockCustomer('18659');
    expect(http).toHaveBeenCalledWith(
      'https://hubsoft.isp.test/api/v1/integracao/cliente/desbloqueio_confianca',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((http as any).mock.calls[0][1].body);
    expect(body).toEqual({ id_cliente_servico: '18659', dias_desbloqueio: '1' });
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
      'https://hubsoft.isp.test/api/v1/integracao/cliente?busca=cpf_cnpj&termo_busca=12345678900',
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
