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
});
