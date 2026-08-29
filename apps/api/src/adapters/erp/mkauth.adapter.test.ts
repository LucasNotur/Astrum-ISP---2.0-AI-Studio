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

// JWT sem assinatura real, só pro decodeJwtExpiry funcionar em teste: header.payload.sig
// payload = { exp: 9999999999 } (ano 2286 — nunca expira nos testes).
const FAKE_JWT = 'eyJhbGciOiJIUzUxMiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig';

function makeAuthThenDataHttp(data: unknown, jwt = FAKE_JWT): HttpClient {
  return vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', text: async () => jwt, json: async () => { throw new Error('não deveria chamar json() na resposta de auth'); } })
    .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => data }) as unknown as HttpClient;
}

const creds = { url: 'https://mk.isp.test', clientId: 'cid-x', clientSecret: 'secret-y' };
const tokenCreds = { url: 'https://mk.isp.test', token: 'pre-generated-jwt' };

describe('MKAuthAdapter', () => {
  it('lança se url ausente ou sem clientId/clientSecret nem token', () => {
    expect(() => new MKAuthAdapter({ url: '', clientId: 'a', clientSecret: 'b' })).toThrow('MK-Auth: credenciais ausentes');
    expect(() => new MKAuthAdapter({ url: 'http://x', clientId: 'só-id' } as any)).toThrow('MK-Auth: credenciais ausentes');
  });

  it('aceita token pré-gerado sem clientId/clientSecret', () => {
    expect(() => new MKAuthAdapter(tokenCreds)).not.toThrow();
  });

  it('token pré-gerado — usa direto como Bearer, sem chamar /api/', async () => {
    const http = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => [] }) as unknown as HttpClient;
    const adapter = new MKAuthAdapter(tokenCreds, http);
    await adapter.findCustomerByCpf('00000000000');
    expect((http as any).mock.calls[0][1].headers['Authorization']).toBe('Bearer pre-generated-jwt');
    expect((http as any).mock.calls.some((c: any[]) => c[0].endsWith('/api/'))).toBe(false);
  });

  it('Basic Auth — troca client_id:client_secret em GET /api/ e usa o JWT cru da resposta como Bearer', async () => {
    const http = makeAuthThenDataHttp({ total_registros: 1, clientes: [{ login: 'lise' }] });
    const adapter = new MKAuthAdapter(creds, http);
    const result = await adapter.findCustomerByCpf('123.456.789-00');

    expect((http as any).mock.calls[0][0]).toBe('https://mk.isp.test/api/');
    const authInit = (http as any).mock.calls[0][1];
    expect(authInit.headers['Authorization']).toBe(`Basic ${Buffer.from('cid-x:secret-y').toString('base64')}`);

    expect((http as any).mock.calls[1][0]).toBe('https://mk.isp.test/api/cliente/listar/cpf_cnpj=12345678900');
    expect((http as any).mock.calls[1][1].headers['Authorization']).toBe(`Bearer ${FAKE_JWT}`);
    expect(result).toEqual({ total_registros: 1, clientes: [{ login: 'lise' }] });
  });

  it('Basic Auth — cacheia o JWT entre chamadas (uma única troca em /api/)', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', text: async () => FAKE_JWT })
      .mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => [] }) as unknown as HttpClient;

    const adapter = new MKAuthAdapter(creds, http);
    await adapter.findCustomerByCpf('11111111111');
    await adapter.getBillingStatus('lise');

    const authCalls = (http as any).mock.calls.filter((c: any[]) => c[0].endsWith('/api/'));
    expect(authCalls).toHaveLength(1);
  });

  it('Basic Auth — lança se a troca em /api/ falha', async () => {
    const http = makeHttp({}, false);
    const adapter = new MKAuthAdapter(creds, http);
    await expect(adapter.findCustomerByCpf('00000000000')).rejects.toThrow('MK-Auth Auth Error: 500');
  });

  it('Basic Auth — lança se a resposta de /api/ vem vazia', async () => {
    const http = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', text: async () => '   ' }) as unknown as HttpClient;
    const adapter = new MKAuthAdapter(creds, http);
    await expect(adapter.findCustomerByCpf('00000000000')).rejects.toThrow('autenticação não retornou token');
  });

  it('tokenCache — usa o JWT cacheado sem fazer nova troca em /api/', async () => {
    const http = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => [] }) as unknown as HttpClient;
    const tokenCache = { get: vi.fn().mockResolvedValue('cached-jwt'), set: vi.fn() };

    const adapter = new MKAuthAdapter(creds, http, tokenCache as any);
    await adapter.findCustomerByCpf('00000000000');

    expect(tokenCache.get).toHaveBeenCalled();
    expect((http as any).mock.calls[0][1].headers['Authorization']).toBe('Bearer cached-jwt');
    expect((http as any).mock.calls.some((c: any[]) => c[0].endsWith('/api/'))).toBe(false);
  });

  it('tokenCache — grava o JWT novo (TTL do claim exp, com 30s de folga)', async () => {
    const http = makeAuthThenDataHttp([]);
    const tokenCache = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };

    const adapter = new MKAuthAdapter(creds, http, tokenCache as any);
    await adapter.findCustomerByCpf('00000000000');

    expect(tokenCache.set).toHaveBeenCalledWith(FAKE_JWT, expect.any(Number));
    const [, ttl] = (tokenCache.set as any).mock.calls[0];
    expect(ttl).toBeGreaterThan(0);
  });

  it('findCustomerByCpf — filtra por cpf_cnpj sem máscara', async () => {
    const http = makeAuthThenDataHttp({ clientes: [] });
    const adapter = new MKAuthAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    expect((http as any).mock.calls[1][0]).toBe('https://mk.isp.test/api/cliente/listar/cpf_cnpj=11122233344');
  });

  it('getBillingStatus — consulta títulos em aberto por login', async () => {
    const http = makeAuthThenDataHttp({ Total: 0, titulos: [] });
    const adapter = new MKAuthAdapter(creds, http);
    await adapter.getBillingStatus('lise');
    expect((http as any).mock.calls[1][0]).toBe('https://mk.isp.test/api/titulo/aberto/lise');
  });

  it('generateSecondCopy — mapeia campos do título (sem link de boleto, só linha digitável/pix)', async () => {
    const http = makeAuthThenDataHttp({
      uuid_lanc: 'AE91D370',
      url: null,
      linhadig: '34191.77005 00065.727778 70144.370007 6 97780000011000',
      pix: 'pix-copia-cola-real',
      pix_link: 'https://provedor.app.br/pix/xyz',
      datavenc: '2024-07-15 00:00:00',
      valor: '110.00',
    });
    const adapter = new MKAuthAdapter(creds, http);
    const result = await adapter.generateSecondCopy('lise', 'AE91D370-DFAB-41CF-81C9-CAEFD69F3AFA');

    expect((http as any).mock.calls[1][0]).toBe(
      'https://mk.isp.test/api/titulo/show/AE91D370-DFAB-41CF-81C9-CAEFD69F3AFA',
    );
    expect(result.boletoUrl).toBe('');
    expect(result.pixCopiaCola).toBe('pix-copia-cola-real');
    expect(result.barcode).toBe('34191.77005 00065.727778 70144.370007 6 97780000011000');
    expect(result.dueDate).toBe('2024-07-15 00:00:00');
    expect(result.amountCents).toBe(11000);
  });

  it('generateSecondCopy — cai pro pix_link quando pix vem vazio', async () => {
    const http = makeAuthThenDataHttp({ pix: '', pix_link: 'https://provedor.app.br/pix/xyz', valor: '50.00' });
    const adapter = new MKAuthAdapter(creds, http);
    const result = await adapter.generateSecondCopy('lise', 'uuid-1');
    expect(result.pixCopiaCola).toBe('https://provedor.app.br/pix/xyz');
  });

  it('getConnectionStatus — online quando bloqueado=nao', async () => {
    const http = makeAuthThenDataHttp({ login: 'lise', bloqueado: 'nao' });
    const adapter = new MKAuthAdapter(creds, http);
    const result = await adapter.getConnectionStatus('lise');
    expect((http as any).mock.calls[1][0]).toBe('https://mk.isp.test/api/cliente/show/lise');
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando bloqueado=sim', async () => {
    const http = makeAuthThenDataHttp({ login: 'lise', bloqueado: 'sim' });
    const adapter = new MKAuthAdapter(creds, http);
    const result = await adapter.getConnectionStatus('lise');
    expect(result.online).toBe(false);
  });

  it('unlockCustomer — resolve uuid_cliente via show e edita bloqueado=nao', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', text: async () => FAKE_JWT }) // auth
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ login: 'lise', uuid_cliente: 'UUID-123', bloqueado: 'sim' }) }) // show
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 'success' }) }) as unknown as HttpClient; // editar

    const adapter = new MKAuthAdapter(creds, http);
    const result = await adapter.unlockCustomer('lise');

    expect((http as any).mock.calls[1][0]).toBe('https://mk.isp.test/api/cliente/show/lise');
    expect((http as any).mock.calls[2][0]).toBe('https://mk.isp.test/api/cliente/editar');
    const editInit = (http as any).mock.calls[2][1];
    expect(editInit.method).toBe('PUT');
    expect(JSON.parse(editInit.body)).toEqual({ uuid: 'UUID-123', bloqueado: 'nao' });
    expect(result).toEqual({ status: 'success' });
  });

  it('unlockCustomer — lança se o cliente não tem uuid (não encontrado)', async () => {
    const http = makeAuthThenDataHttp({ login: 'fantasma' });
    const adapter = new MKAuthAdapter(creds, http);
    await expect(adapter.unlockCustomer('fantasma')).rejects.toThrow('não encontrado');
  });

  it('lança quando API responde !ok (fora da autenticação)', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', text: async () => FAKE_JWT })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({}) }) as unknown as HttpClient;
    const adapter = new MKAuthAdapter(creds, http);
    await expect(adapter.getBillingStatus('lise')).rejects.toThrow('MK-Auth API Error: 500');
  });

  it('lança com mensagem clara quando a resposta não é JSON válido (painel PHP quebrado)', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', text: async () => FAKE_JWT })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => { throw new SyntaxError('Unexpected token <'); },
      }) as unknown as HttpClient;
    const adapter = new MKAuthAdapter(creds, http);
    await expect(adapter.getBillingStatus('lise')).rejects.toThrow('MK-Auth: resposta não é JSON válido');
  });

  // ── P3 — Funil de vendas ─────────────────────────────────────────────────────

  it('checkViability — lança "não suportado" (API não documenta viabilidade por endereço)', async () => {
    const adapter = new MKAuthAdapter(tokenCreds, makeHttp({}));
    await expect(adapter.checkViability('Rua X, 123')).rejects.toThrow('checkViability não suportado');
  });

  it('getPlans — mapeia /api/plano/listar (Kbps → Mbps dividindo por 1000)', async () => {
    const http = makeAuthThenDataHttp({
      total_registros: 1,
      planos: [{ uuid: '00963f1a', nome: 'RuraldeAltaVelocidade75Mbps', valor: '77.00', velup: '75000', veldown: '75000', descricao: 'Plano rural' }],
    });
    const adapter = new MKAuthAdapter(creds, http);
    const result = await adapter.getPlans();
    expect((http as any).mock.calls[1][0]).toBe('https://mk.isp.test/api/plano/listar/pagina=1');
    expect(result).toEqual([{ id: '00963f1a', name: 'RuraldeAltaVelocidade75Mbps', downloadMbps: 75, uploadMbps: 75, priceCents: 7700, description: 'Plano rural' }]);
  });

  it('createPreRegistration — POST /api/cliente/inserir com login/senha gerados, resolve uuid via show', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', text: async () => FAKE_JWT }) // auth
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 'sucesso' }) }) // cliente/inserir
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ login: 'joaodasilva7890', uuid_cliente: 'UUID-999' }) }) as unknown as HttpClient; // cliente/show

    const adapter = new MKAuthAdapter(creds, http);
    const result = await adapter.createPreRegistration({
      fullName: 'João da Silva', cpf: '123.456.789-00', email: 'joao@email.com', phone: '19999999999', address: 'Rua X, 123', planId: '1',
    });

    const insertInit = (http as any).mock.calls[1][1];
    const insertBody = JSON.parse(insertInit.body);
    expect(insertBody.nome).toBe('João da Silva');
    expect(insertBody.cpf).toBe('12345678900');
    expect(insertBody.Login).toMatch(/^joaodasilva\d{4}$/);
    expect(insertBody.senha).toBeTruthy();
    expect((http as any).mock.calls[2][0]).toBe(`https://mk.isp.test/api/cliente/show/${insertBody.Login}`);
    expect(result).toEqual({ leadId: 'UUID-999', externalId: insertBody.Login });
  });

  it('createPreRegistration — lança se não conseguir confirmar o uuid depois de criar', async () => {
    const http = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', text: async () => FAKE_JWT })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 'sucesso' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, statusText: 'OK', json: async () => ({ login: 'fantasma' }) }) as unknown as HttpClient;

    const adapter = new MKAuthAdapter(creds, http);
    await expect(adapter.createPreRegistration({
      fullName: 'Fantasma', cpf: '00000000000', phone: '000', address: '', planId: '1',
    })).rejects.toThrow('não foi possível confirmar o uuid');
  });

  it('scheduleInstallation — lança "não suportado" (sem campo de data em instalacao/inserir ou chamado/inserir)', async () => {
    const adapter = new MKAuthAdapter(tokenCreds, makeHttp({}));
    await expect(adapter.scheduleInstallation('UUID-999', '2026-09-01')).rejects.toThrow('scheduleInstallation não suportado');
  });
});
