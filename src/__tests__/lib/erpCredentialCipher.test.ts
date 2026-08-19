import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { decryptString, looksEncrypted } from '../../lib/erpCredentialCipher';

// Import cross-package SÓ NO TESTE para provar compatibilidade entre a porta
// READ-ONLY do legado e o encryptString do módulo irmão de apps/api (mesma chave,
// mesmo envelope). Se o resolvedor de módulos reclamar deste caminho, gerar o
// ciphertext manualmente com node:crypto inline (mesmo algoritmo).
import { encryptString } from '../../../apps/api/src/adapters/erp/credential-cipher';

const TEST_KEY = 'f'.repeat(64);
const PREV_KEY = process.env.ERP_CRED_KEY;

beforeAll(() => {
  process.env.ERP_CRED_KEY = TEST_KEY;
});

afterAll(() => {
  if (PREV_KEY === undefined) delete process.env.ERP_CRED_KEY;
  else process.env.ERP_CRED_KEY = PREV_KEY;
});

describe('erpCredentialCipher (porta READ-ONLY)', () => {
  it('round-trip: encryptString (apps/api) → decryptString (legado)', () => {
    const plain = 'sk-openai-1234567890';
    const ciphertext = encryptString(plain);
    expect(ciphertext).not.toContain(plain);
    expect(decryptString(ciphertext)).toBe(plain);
  });

  it('round-trip com valor Evolution', () => {
    const plain = 'A9F8-7E2D-C1B0-8A3F';
    expect(decryptString(encryptString(plain))).toBe(plain);
  });

  it('looksEncrypted: true para envelope válido', () => {
    expect(looksEncrypted(encryptString('x'))).toBe(true);
  });

  it('looksEncrypted: false para texto puro', () => {
    expect(looksEncrypted('sk-plain-api-key')).toBe(false);
    expect(looksEncrypted('')).toBe(false);
    expect(looksEncrypted(null)).toBe(false);
    expect(looksEncrypted(undefined)).toBe(false);
    expect(looksEncrypted('only:two')).toBe(false);
    expect(looksEncrypted('a:b:c:d')).toBe(false);
  });

  it('decryptString lança em payload malformado (não mascara o erro)', () => {
    expect(() => decryptString('nao-e-um-envelope')).toThrow();
    expect(() => decryptString('a:b')).toThrow();
  });

  it('decryptString lança quando a tag GCM não bate (chave errada)', () => {
    const ciphertext = encryptString('segredo');
    process.env.ERP_CRED_KEY = '0'.repeat(64);
    try {
      expect(() => decryptString(ciphertext)).toThrow();
    } finally {
      process.env.ERP_CRED_KEY = TEST_KEY;
    }
  });
});
