import { describe, it, expect, vi } from 'vitest';
import { RadiusNetAdapter } from './radiusnet.adapter';
import type { HttpClient } from './erp.types';

function makeHttp(data: unknown, ok = true): HttpClient {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: async () => data,
  });
}

const creds = { url: 'https://radius.isp.test', token: 'rn-token-123' };
const BASE = 'https://radius.isp.test/radiusnet/index.php/api/v1';

describe('RadiusNetAdapter', () => {
  it('lança se url ou token ausentes', () => {
    expect(() => new RadiusNetAdapter({ url: '', token: 'x' })).toThrow('RadiusNet: credenciais ausentes');
    expect(() => new RadiusNetAdapter({ url: 'http://x', token: '' })).toThrow('RadiusNet: credenciais ausentes');
  });

  it('usa o header RTOKEN cru (sem esquema Bearer/Basic)', async () => {
    const http = makeHttp({ rows: [] });
    const adapter = new RadiusNetAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    const init = (http as any).mock.calls[0][1];
    expect(init.headers['RTOKEN']).toBe('rn-token-123');
  });

  it('findCustomerByCpf — remove máscara e usa /cp/{cpf}/5 (todos os status)', async () => {
    const http = makeHttp({ rows: [{ id_cliente: '1' }] });
    const adapter = new RadiusNetAdapter(creds, http);
    await adapter.findCustomerByCpf('111.222.333-44');
    expect(http).toHaveBeenCalledWith(`${BASE}/cp/11122233344/5`, expect.anything());
  });

  it('getBillingStatus — usa /cbc/npt/{customerId}', async () => {
    const http = makeHttp({ rows: [{ id_cobranca: '1' }], count: 1 });
    const adapter = new RadiusNetAdapter(creds, http);
    const result = await adapter.getBillingStatus('447');
    expect(http).toHaveBeenCalledWith(`${BASE}/cbc/npt/447`, expect.anything());
    expect(result).toEqual([{ id_cobranca: '1' }]);
  });

  it('generateSecondCopy — combina cbc (valor/vencimento/linha) + bc (boleto) + scp (pix)', async () => {
    const http = vi.fn(async (url: string) => {
      if (url.includes('/cbc/')) {
        return {
          ok: true, status: 200, statusText: 'OK',
          json: async () => ({
            rows: [{ id_cobranca: '7387143', valor_total_a_pagar: '294,80', data_vencimento: '2020-01-10', linha_digitavel: '99999.99999' }],
          }),
        };
      }
      if (url.includes('/bc/')) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ rows: 'https://radius.isp.test/boleto.pdf' }) };
      }
      if (url.includes('/scp/')) {
        return { ok: true, status: 200, statusText: 'OK', json: async () => ({ rows: { qrcode_copy_paste: 'pix-code' } }) };
      }
      throw new Error('unexpected url ' + url);
    });
    const adapter = new RadiusNetAdapter(creds, http as unknown as HttpClient);
    const result = await adapter.generateSecondCopy('447', '7387143');
    expect(result.boletoUrl).toBe('https://radius.isp.test/boleto.pdf');
    expect(result.pixCopiaCola).toBe('pix-code');
    expect(result.barcode).toBe('99999.99999');
    expect(result.dueDate).toBe('2020-01-10');
    expect(result.amountCents).toBe(29480);
  });

  it('getConnectionStatus — proxy via /cp/{cpf}/2 (status Ativo), online quando há plano ativo', async () => {
    const http = makeHttp({ rows: [{ id_cliente: '1' }] });
    const adapter = new RadiusNetAdapter(creds, http);
    const result = await adapter.getConnectionStatus('11122233344');
    expect(http).toHaveBeenCalledWith(`${BASE}/cp/11122233344/2`, expect.anything());
    expect(result.online).toBe(true);
  });

  it('getConnectionStatus — offline quando não há plano ativo', async () => {
    const http = makeHttp({ rows: [] });
    const adapter = new RadiusNetAdapter(creds, http);
    const result = await adapter.getConnectionStatus('11122233344');
    expect(result.online).toBe(false);
  });

  it('unlockCustomer — PUT /ascli/ com IDCLI+IDSTATUS=2 (Avisado) urlencoded', async () => {
    const http = makeHttp({ rows: { success: true } });
    const adapter = new RadiusNetAdapter(creds, http);
    await adapter.unlockCustomer('447');
    expect(http).toHaveBeenCalledWith(`${BASE}/ascli/`, expect.objectContaining({
      method: 'PUT',
      body: 'IDCLI=447&IDSTATUS=2',
    }));
  });

  it('lança quando API responde !ok', async () => {
    const http = makeHttp({}, false);
    const adapter = new RadiusNetAdapter(creds, http);
    await expect(adapter.getBillingStatus('447')).rejects.toThrow('RadiusNet API Error: 500');
  });

  it('remove trailing slash da URL base', async () => {
    const http = makeHttp({ rows: [] });
    const adapter = new RadiusNetAdapter({ url: 'https://radius.isp.test/', token: 'x' }, http);
    await adapter.findCustomerByCpf('12345678900');
    expect(http).toHaveBeenCalledWith(`${BASE}/cp/12345678900/5`, expect.anything());
  });
});
