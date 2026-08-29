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

const creds = { url: 'https://sgp.isp.test', token: 'sgp-token-abc', app: 'Chatbot' };

const clienteAtivo = {
  id: 2307,
  nome: 'ADAO DA SILVA RIBEIRO',
  cpfcnpj: '043.918.595-56',
  contratos: [
    { id: 1888, status: 'Cancelado' },
    { id: 1857, status: 'Ativo' },
  ],
  titulos: [
    {
      id: 21029,
      link: 'https://demo.sgp.net.br/boleto/19079-XB50CRTQYM/',
      codigoPix: '',
      linhaDigitavel: '',
      codigoBarras: '',
      dataVencimento: '2026-01-25',
      valor: 109.8,
      valorCorrigido: 109.8,
      status: 'cancelado',
    },
    {
      id: 21020,
      link: 'https://demo.sgp.net.br/boleto/19072-B20K3VZU0W/',
      codigoPix: 'pix-copia-cola',
      linhaDigitavel: '03399.00003',
      codigoBarras: '',
      dataVencimento: '2025-12-25',
      valor: 29.28,
      valorCorrigido: 32.27,
      status: 'aberto',
    },
  ],
};

describe('SGPAdapter — contrato real (validado ao vivo contra demo.sgp.net.br, 2026-08-28)', () => {
  it('lança se faltar url, token ou app', () => {
    expect(() => new SGPAdapter({ url: '', token: 'x', app: 'a' })).toThrow('SGP: credenciais ausentes');
    expect(() => new SGPAdapter({ url: 'http://x', token: '', app: 'a' })).toThrow('SGP: credenciais ausentes');
    expect(() => new SGPAdapter({ url: 'http://x', token: 'x' } as any)).toThrow('SGP: credenciais ausentes');
  });

  it('findCustomerByCpf — POST form-data em /api/ura/clientes/ com token+app no corpo (não header)', async () => {
    const http = makeHttp({ paginacao: { total: 1 }, clientes: [clienteAtivo] });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.findCustomerByCpf('043.918.595-56');

    expect(result).toEqual(clienteAtivo);
    const [url, init] = (http as any).mock.calls[0];
    expect(url).toBe('https://sgp.isp.test/api/ura/clientes/');
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined(); // sem header custom — token/app vão no form-data
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('token')).toBe('sgp-token-abc');
    expect((init.body as FormData).get('app')).toBe('Chatbot');
    expect((init.body as FormData).get('cpfcnpj')).toBe('04391859556'); // sem máscara
  });

  it('getBillingStatus — devolve cliente.titulos', async () => {
    const http = makeHttp({ clientes: [clienteAtivo] });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.getBillingStatus('04391859556');
    expect(result).toEqual(clienteAtivo.titulos);
  });

  it('getBillingStatus — lança quando o CPF não é encontrado (clientes vazio)', async () => {
    const http = makeHttp({ paginacao: { total: 0 }, clientes: [] });
    const adapter = new SGPAdapter(creds, http);
    await expect(adapter.getBillingStatus('00000000000')).rejects.toThrow('cliente não encontrado');
  });

  it('generateSecondCopy — acha o título pelo id e mapeia os campos reais (link/codigoPix/linhaDigitavel/valorCorrigido)', async () => {
    const http = makeHttp({ clientes: [clienteAtivo] });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.generateSecondCopy('04391859556', '21020');
    expect(result.boletoUrl).toBe('https://demo.sgp.net.br/boleto/19072-B20K3VZU0W/');
    expect(result.pixCopiaCola).toBe('pix-copia-cola');
    expect(result.barcode).toBe('03399.00003');
    expect(result.dueDate).toBe('2025-12-25');
    expect(result.amountCents).toBe(3227); // valorCorrigido (com juros/multa), não valor base
  });

  it('generateSecondCopy — lança quando o invoiceId não está entre os títulos do cliente (não manda o boleto errado)', async () => {
    const http = makeHttp({ clientes: [clienteAtivo] });
    const adapter = new SGPAdapter(creds, http);
    await expect(adapter.generateSecondCopy('04391859556', 'inexistente')).rejects.toThrow('não encontrado');
  });

  it('getConnectionStatus — online quando algum contrato está Ativo (fallback administrativo, sem dado de ONU)', async () => {
    const http = makeHttp({ clientes: [clienteAtivo] });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.getConnectionStatus('04391859556');
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando nenhum contrato está Ativo (fallback administrativo)', async () => {
    const http = makeHttp({
      clientes: [{ ...clienteAtivo, contratos: [{ id: 1, status: 'Suspenso' }, { id: 2, status: 'Cancelado' }] }],
    });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.getConnectionStatus('04391859556');
    expect(result.online).toBe(false);
  });

  it('getConnectionStatus — usa sessão RADIUS real (onu.conexao.status) quando disponível, ignora status administrativo', async () => {
    const http = makeHttp({
      clientes: [{
        ...clienteAtivo,
        contratos: [{ id: 1857, status: 'Ativo', servicos: [{ id: 1, onu: { conexao: { status: 'offline' } } }] }],
      }],
    });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.getConnectionStatus('04391859556');
    expect(result.online).toBe(false); // onu.conexao.status manda, mesmo com contrato Ativo
  });

  it('unlockCustomer — resolve o contrato do cliente por CPF, POST em /api/ura/liberacaopromessa/', async () => {
    const http = vi.fn(async (url: string, init: any) => {
      if (url.endsWith('/api/ura/clientes/')) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ clientes: [clienteAtivo] }) };
      }
      if (url.endsWith('/api/ura/liberacaopromessa/')) {
        expect((init.body as FormData).get('contrato')).toBe('1888');
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 1, liberado: true, liberado_dias: 1, contratoId: 1888 }) };
      }
      throw new Error('unexpected url ' + url);
    }) as unknown as HttpClient;
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.unlockCustomer('04391859556');
    expect(result.liberado).toBe(true);
  });

  it('unlockCustomer — lança quando a API responde liberado=false (não é erro HTTP)', async () => {
    const http = vi.fn(async (url: string) => {
      if (url.endsWith('/api/ura/clientes/')) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ clientes: [clienteAtivo] }) };
      }
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ status: 1, liberado: false, msg: 'Cobrança não vinculada a um método de pagamento' }) };
    }) as unknown as HttpClient;
    const adapter = new SGPAdapter(creds, http);
    await expect(adapter.unlockCustomer('04391859556')).rejects.toThrow('não concedida');
  });

  it('unlockCustomer — lança quando o cliente não é encontrado', async () => {
    const http = makeHttp({ clientes: [] });
    const adapter = new SGPAdapter(creds, http);
    await expect(adapter.unlockCustomer('00000000000')).rejects.toThrow('cliente não encontrado');
  });

  it('lança quando API responde !ok, com corpo do erro anexado', async () => {
    const http: HttpClient = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ detail: 'Credenciais de autenticação incorretas.' }),
    });
    const adapter = new SGPAdapter(creds, http);
    await expect(adapter.findCustomerByCpf('04391859556')).rejects.toThrow(/SGP API Error: 403.*Credenciais de autenticação incorretas/);
  });

  // ── P3 — Funil de vendas ─────────────────────────────────────────────────────

  it('checkViability — POST ura/viabilidade com o endereço em logradouro', async () => {
    const http = makeHttp({ viabilidade: true });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.checkViability('Rua X, 123');
    const [url, init] = (http as any).mock.calls[0];
    expect(url).toBe('https://sgp.isp.test/api/ura/viabilidade/');
    expect((init.body as FormData).get('logradouro')).toBe('Rua X, 123');
    expect(result).toEqual({ available: true, raw: { viabilidade: true } });
  });

  it('checkViability — indisponível quando viabilidade=false', async () => {
    const http = makeHttp({ viabilidade: false });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.checkViability('endereço qualquer');
    expect(result.available).toBe(false);
  });

  it('getPlans — POST precadastro/plano/list, mapeia id/descricao/valor', async () => {
    const http = makeHttp([{ tipo: 'internet', id: 1, descricao: 'PLANO_DESCRICAO', valor: 99.9 }]);
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.getPlans();
    const [url] = (http as any).mock.calls[0];
    expect(url).toBe('https://sgp.isp.test/api/precadastro/plano/list');
    expect(result).toEqual([{ id: '1', name: 'PLANO_DESCRICAO', downloadMbps: 0, uploadMbps: 0, priceCents: 9990 }]);
  });

  it('createPreRegistration — POST precadastro/F com os campos mapeados, usa CPF como leadId', async () => {
    const http = makeHttp({ message: 'Pre-cadastro criado com sucesso' });
    const adapter = new SGPAdapter(creds, http);
    const result = await adapter.createPreRegistration({
      fullName: 'João da Silva', cpf: '123.456.789-00', phone: '19999999999', email: 'joao@email.com', address: 'Rua X, 123', planId: '1',
    });
    const [url, init] = (http as any).mock.calls[0];
    expect(url).toBe('https://sgp.isp.test/api/precadastro/F');
    const form = init.body as FormData;
    expect(form.get('nome')).toBe('João da Silva');
    expect(form.get('cpfcnpj')).toBe('12345678900');
    expect(form.get('celular')).toBe('19999999999');
    expect(form.get('planointernet_id')).toBe('1');
    expect(result).toEqual({ leadId: '12345678900' });
  });

  it('scheduleInstallation — lança "não suportado" (sem endpoint de agendamento na collection)', async () => {
    const adapter = new SGPAdapter(creds, makeHttp({}));
    await expect(adapter.scheduleInstallation('12345678900', '2026-09-01')).rejects.toThrow('scheduleInstallation não suportado');
  });
});
