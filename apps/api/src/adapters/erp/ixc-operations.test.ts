/**
 * P0-06 — Testes das capacidades operacionais do IXC (suspensão + OS via ERP).
 */
import { describe, it, expect, vi } from 'vitest';
import { IXCAdapter } from './ixc.adapter';
import { supportsErpOperations, type HttpClient } from './erp.types';

function makeHttp(data: unknown, ok = true): HttpClient {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => data,
  });
}

const creds = { url: 'https://ixc.isp.test', token: 'user:token' };

describe('IXCAdapter — ERPOperationsCapable (P0-06)', () => {
  it('type guard reconhece o IXC como operations-capable', () => {
    const adapter = new IXCAdapter(creds, makeHttp({}));
    expect(supportsErpOperations(adapter)).toBe(true);
  });

  it('suspendCustomer chama o endpoint de suspensão parcial com motivo', async () => {
    const http = makeHttp({ type: 'success' });
    const adapter = new IXCAdapter(creds, http);
    const r = await adapter.suspendCustomer('123', 'Inadimplência 30d');
    expect(r.success).toBe(true);
    expect(http).toHaveBeenCalledWith(
      'https://ixc.isp.test/webservice/v1/cliente_contrato_btn_susp_parc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id_contrato: '123', motivo: 'Inadimplência 30d' }),
      }),
    );
  });

  it('suspendCustomer marca success=false quando o IXC devolve erro lógico', async () => {
    const adapter = new IXCAdapter(creds, makeHttp({ type: 'error', message: 'contrato não encontrado' }));
    const r = await adapter.suspendCustomer('999');
    expect(r.success).toBe(false);
  });

  it('createServiceOrder abre chamado su_oss_chamado e devolve o id', async () => {
    const http = makeHttp({ id: '4567' });
    const adapter = new IXCAdapter(creds, http);
    const r = await adapter.createServiceOrder({
      customerId: '123',
      description: 'Sem sinal após chuva',
      scheduledFor: '2026-07-15T09:00:00Z',
    });
    expect(r.orderId).toBe('4567');
    const call = vi.mocked(http).mock.calls[0]!;
    expect(call[0]).toBe('https://ixc.isp.test/webservice/v1/su_oss_chamado');
    const body = JSON.parse(call[1].body);
    expect(body.id_cliente).toBe('123');
    expect(body.tipo).toBe('C');
    expect(body.data_agenda).toBe('2026-07-15');
  });

  it('createServiceOrder lança quando o IXC não devolve id', async () => {
    const adapter = new IXCAdapter(creds, makeHttp({}));
    await expect(
      adapter.createServiceOrder({ customerId: '1', description: 'x' }),
    ).rejects.toThrow('não retornou id');
  });

  it('createServiceOrder sem scheduledFor não envia data_agenda', async () => {
    const http = makeHttp({ id: '1' });
    const adapter = new IXCAdapter(creds, http);
    await adapter.createServiceOrder({ customerId: '1', description: 'x' });
    const body = JSON.parse(vi.mocked(http).mock.calls[0]![1].body);
    expect(body.data_agenda).toBeUndefined();
  });
});
