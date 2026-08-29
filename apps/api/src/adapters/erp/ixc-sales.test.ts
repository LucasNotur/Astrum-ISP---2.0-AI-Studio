/**
 * P3 — Testes das capacidades de vendas do IXC (viabilidade, planos,
 * pré-cadastro, agendamento de instalação). Sem cobertura de teste até
 * 2026-08-29 apesar de "implementadas" — achado ao investigar
 * `scheduleInstallation`, que usava uma tabela `os` inexistente
 * (confirmado contra `github.com/isacna/ixc-soft-api`: não há tabela `os`
 * separada, é a mesma `su_oss_chamado` de `createServiceOrder`).
 */
import { describe, it, expect, vi } from 'vitest';
import { IXCAdapter } from './ixc.adapter';
import { supportsErpSales, type HttpClient } from './erp.types';

function makeHttp(data: unknown, ok = true): HttpClient {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => data,
  });
}

const creds = { url: 'https://ixc.isp.test', token: 'user:token' };

describe('IXCAdapter — ERPSalesCapable (P3)', () => {
  it('type guard reconhece o IXC como sales-capable', () => {
    const adapter = new IXCAdapter(creds, makeHttp({}));
    expect(supportsErpSales(adapter)).toBe(true);
  });

  it('checkViability — consulta viabilidade e normaliza portas disponíveis', async () => {
    const http = makeHttp({ registros: [{ id_cto: '9', cto: 'CTO-09', portas_disponiveis: '4' }] });
    const adapter = new IXCAdapter(creds, http);
    const result = await adapter.checkViability('Rua Teste, 123');
    expect(http).toHaveBeenCalledWith('https://ixc.isp.test/webservice/v1/viabilidade', expect.anything());
    expect(result.available).toBe(true);
    expect(result.ctoId).toBe('9');
    expect(result.availablePorts).toBe(4);
  });

  it('checkViability — indisponível quando não há registros', async () => {
    const adapter = new IXCAdapter(creds, makeHttp({ registros: [] }));
    const result = await adapter.checkViability('Endereço sem cobertura');
    expect(result.available).toBe(false);
  });

  it('getPlans — lista planos ativos e normaliza preço', async () => {
    const http = makeHttp({
      registros: [{ id: '1', nome: '100 MEGA', velocidade_download: '100', velocidade_upload: '50', valor: '99,90' }],
    });
    const adapter = new IXCAdapter(creds, http);
    const plans = await adapter.getPlans();
    expect(http).toHaveBeenCalledWith('https://ixc.isp.test/webservice/v1/plano_acesso', expect.anything());
    expect(plans).toEqual([{
      id: '1', name: '100 MEGA', downloadMbps: 100, uploadMbps: 50, priceCents: 9990, description: undefined,
    }]);
  });

  it('createPreRegistration — cria cliente inativo e devolve o id', async () => {
    const http = makeHttp({ id: '555' });
    const adapter = new IXCAdapter(creds, http);
    const result = await adapter.createPreRegistration({
      fullName: 'Maria Teste', cpf: '111.222.333-44', phone: '(11) 99999-8888', address: 'Rua X, 1', planId: '2',
    });
    expect(result).toEqual({ leadId: '555', externalId: '555' });
    const call = vi.mocked(http).mock.calls[0]!;
    expect(call[0]).toBe('https://ixc.isp.test/webservice/v1/cliente');
    const body = JSON.parse(call[1].body);
    expect(body.cnpj_cpf).toBe('11122233344');
    expect(body.ativo).toBe('N');
  });

  it('createPreRegistration — lança quando o IXC não devolve id', async () => {
    const adapter = new IXCAdapter(creds, makeHttp({}));
    await expect(adapter.createPreRegistration({
      fullName: 'X', cpf: '00000000000', phone: '0', address: 'Y', planId: '1',
    })).rejects.toThrow('não retornou id');
  });

  it('scheduleInstallation — usa su_oss_chamado (não uma tabela "os" separada) com data_agenda', async () => {
    const http = makeHttp({ id: '789' });
    const adapter = new IXCAdapter(creds, http);
    const result = await adapter.scheduleInstallation('555', '2026-09-01');
    expect(result).toEqual({ orderId: '789' });
    const call = vi.mocked(http).mock.calls[0]!;
    expect(call[0]).toBe('https://ixc.isp.test/webservice/v1/su_oss_chamado');
    const body = JSON.parse(call[1].body);
    expect(body.id_cliente).toBe('555');
    expect(body.tipo).toBe('I');
    expect(body.data_agenda).toBe('2026-09-01');
    expect(body.data_prevista).toBeUndefined();
    expect(body.assunto).toBeUndefined();
  });

  it('scheduleInstallation — lança quando o IXC não devolve id', async () => {
    const adapter = new IXCAdapter(creds, makeHttp({}));
    await expect(adapter.scheduleInstallation('1', '2026-09-01')).rejects.toThrow('não retornou id');
  });
});
