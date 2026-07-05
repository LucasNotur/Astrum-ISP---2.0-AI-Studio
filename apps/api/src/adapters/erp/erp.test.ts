import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { encryptCredentials, decryptCredentials } from './credential-cipher';
import { parseAmountToCents } from './erp.types';
import { IXCAdapter, normalizeIxcSecondCopy } from './ixc.adapter';
import { MKAuthAdapter } from './mkauth.adapter';
import { createErpProvider, isErpImplemented } from './erp.factory';
import type { HttpClient } from './erp.types';

const KEY = crypto.randomBytes(32);

const httpOk = (payload: any): HttpClient =>
  vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => payload });
const httpErr = (status: number): HttpClient =>
  vi.fn().mockResolvedValue({ ok: false, status, statusText: 'ERR', json: async () => ({}) });

describe('credential-cipher (segurança)', () => {
  it('round-trip encrypt→decrypt recupera o objeto', () => {
    const creds = { url: 'https://ixc.isp.com', token: 'secret-token' };
    const enc = encryptCredentials(creds, KEY);
    expect(enc).not.toContain('secret-token'); // cifrado, não vaza
    expect(decryptCredentials(enc, KEY)).toEqual(creds);
  });

  it('ciphertext difere a cada chamada (IV aleatório)', () => {
    const a = encryptCredentials({ x: 1 }, KEY);
    const b = encryptCredentials({ x: 1 }, KEY);
    expect(a).not.toBe(b);
  });

  it('falha ao decifrar com chave errada (GCM auth)', () => {
    const enc = encryptCredentials({ x: 1 }, KEY);
    expect(() => decryptCredentials(enc, crypto.randomBytes(32))).toThrow();
  });

  it('rejeita payload malformado', () => {
    expect(() => decryptCredentials('lixo', KEY)).toThrow(/malformado/);
  });
});

describe('IXCAdapter', () => {
  const creds = { url: 'https://ixc.isp.com', token: 'tok' };

  it('lança se faltam credenciais', () => {
    expect(() => new IXCAdapter({ url: '', token: '' } as any)).toThrow(/credenciais/);
  });

  it('findCustomerByCpf sanitiza o CPF e faz POST com header listar', async () => {
    const http = httpOk({ registros: [{ id: '1' }] });
    const ixc = new IXCAdapter(creds, http);
    await ixc.findCustomerByCpf('123.456.789-00');
    const [, init] = (http as any).mock.calls[0];
    expect(JSON.parse(init.body).query).toBe('12345678900');
    expect(init.headers.ixcsoft).toBe('listar');
  });

  it('propaga erro HTTP', async () => {
    const ixc = new IXCAdapter(creds, httpErr(500));
    await expect(ixc.findCustomerByCpf('x')).rejects.toThrow(/IXC API Error: 500/);
  });

  it('generateSecondCopy normaliza boleto/pix e converte valor', async () => {
    const http = httpOk({ url: 'https://b/1', pix: 'PIXCODE', linha_digitavel: '00190', data_vencimento: '2026-07-10', valor: '149,90' });
    const ixc = new IXCAdapter(creds, http);
    const r = await ixc.generateSecondCopy('c1', 'inv1');
    expect(r.boletoUrl).toBe('https://b/1');
    expect(r.pixCopiaCola).toBe('PIXCODE');
    expect(r.amountCents).toBe(14990);
  });

  it('getConnectionStatus detecta online', async () => {
    const ixc = new IXCAdapter(creds, httpOk({ registros: [{ online: 'S' }] }));
    expect((await ixc.getConnectionStatus('c1')).online).toBe(true);
  });
});

describe('parseAmountToCents — formatos de valor', () => {
  it('número puro', () => expect(parseAmountToCents(99.9)).toBe(9990));
  it('BR com milhar e decimal: 1.234,56 → 123456', () => expect(parseAmountToCents('1.234,56')).toBe(123456));
  it('BR só decimal: 149,90 → 14990', () => expect(parseAmountToCents('149,90')).toBe(14990));
  it('US com ponto decimal: 149.90 → 14990', () => expect(parseAmountToCents('149.90')).toBe(14990));
  it('vazio/invalido → 0', () => { expect(parseAmountToCents('')).toBe(0); expect(parseAmountToCents(null)).toBe(0); });
});

describe('normalizeIxcSecondCopy — conversão de valor', () => {
  it('valor em número', () => {
    expect(normalizeIxcSecondCopy({ valor: 99.9 }).amountCents).toBe(9990);
  });
  it('valor com vírgula', () => {
    expect(normalizeIxcSecondCopy({ valor: '1.234,56' }).amountCents).toBe(123456);
  });
});

describe('MKAuthAdapter', () => {
  const creds = { url: 'https://mk.isp.com', token: 'mkkey' };

  it('usa header MK-Auth-Key', async () => {
    const http = httpOk([{ id: '1' }]);
    await new MKAuthAdapter(creds, http).findCustomerByCpf('12345678900');
    const [, init] = (http as any).mock.calls[0];
    expect(init.headers['MK-Auth-Key']).toBe('mkkey');
  });

  it('generateSecondCopy escolhe o boleto do invoiceId', async () => {
    const http = httpOk([{ id: 'inv1', url: 'https://b/inv1', pix: 'P1', valor: '50,00' }]);
    const r = await new MKAuthAdapter(creds, http).generateSecondCopy('c1', 'inv1');
    expect(r.boletoUrl).toBe('https://b/inv1');
    expect(r.amountCents).toBe(5000);
  });
});

describe('erp.factory', () => {
  it('resolve ixc e mkauth', () => {
    expect(isErpImplemented('ixc')).toBe(true);
    expect(isErpImplemented('mkauth')).toBe(true);
    expect(createErpProvider('ixc', { url: 'u', token: 't' }).name).toBe('ixc');
  });

  it('lança para provider ainda não implementado', () => {
    expect(isErpImplemented('sgp')).toBe(false);
    expect(() => createErpProvider('voalle', { url: 'u', token: 't' })).toThrow(/não implementado/);
  });
});
