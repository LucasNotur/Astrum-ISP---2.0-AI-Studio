import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encodeDlqPayload, decodeDlqPayload } from '../../lib/dlqPayload.ts';

// Chave AES válida (32 bytes = 64 hex) só para o teste.
const TEST_KEY = 'a'.repeat(64);

const SAMPLE = {
  tenantId: 'tenant-1',
  phone: '+5511999998888',
  content: 'Olá, sua fatura de R$ 199,90 venceu.',
  media: 'data:image/png;base64,AAAABBBBCCCC',
};

describe('dlqPayload codec (OBS-07)', () => {
  const original = process.env.CPF_ENCRYPTION_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.CPF_ENCRYPTION_KEY;
    else process.env.CPF_ENCRYPTION_KEY = original;
  });

  describe('com CPF_ENCRYPTION_KEY setada (produção)', () => {
    beforeEach(() => { process.env.CPF_ENCRYPTION_KEY = TEST_KEY; });

    it('encode cifra: não vaza PII em claro e produz { __enc, v }', () => {
      const enc = encodeDlqPayload(SAMPLE);
      expect(enc).toHaveProperty('__enc');
      expect(enc.v).toBe(1);
      const blob = JSON.stringify(enc);
      expect(blob).not.toContain('+5511999998888');
      expect(blob).not.toContain('venceu');
      expect(blob).not.toContain('base64,AAAA');
    });

    it('round-trip: decode(encode(x)) === x', () => {
      const roundTripped = decodeDlqPayload(encodeDlqPayload(SAMPLE));
      expect(roundTripped).toEqual(SAMPLE);
    });

    it('decode de linha legada em texto puro (sem __enc) passa direto', () => {
      expect(decodeDlqPayload(SAMPLE)).toEqual(SAMPLE);
    });
  });

  describe('sem CPF_ENCRYPTION_KEY (dev/seed) — degradação graciosa', () => {
    beforeEach(() => { delete process.env.CPF_ENCRYPTION_KEY; });

    it('encode NÃO lança e cai para texto puro (rede de segurança preservada)', () => {
      const enc = encodeDlqPayload(SAMPLE);
      expect(enc).toEqual(SAMPLE);
      expect(enc).not.toHaveProperty('__enc');
    });

    it('decode de payload plaintext continua funcionando', () => {
      expect(decodeDlqPayload(SAMPLE)).toEqual(SAMPLE);
    });
  });

  it('decode de null/undefined retorna objeto vazio', () => {
    expect(decodeDlqPayload(null)).toEqual({});
    expect(decodeDlqPayload(undefined)).toEqual({});
  });
});
