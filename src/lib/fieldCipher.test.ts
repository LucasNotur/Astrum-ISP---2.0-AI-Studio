import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptField, decryptField, FieldCipherError } from './fieldCipher';

const KEY = 'a'.repeat(64); // 32 bytes em hex

describe('fieldCipher (SEC-R1 fail-closed)', () => {
  const orig = process.env.CPF_ENCRYPTION_KEY;
  beforeEach(() => { process.env.CPF_ENCRYPTION_KEY = KEY; });
  afterEach(() => {
    if (orig === undefined) delete process.env.CPF_ENCRYPTION_KEY;
    else process.env.CPF_ENCRYPTION_KEY = orig;
  });

  it('round-trip cifra e decifra', () => {
    const enc = encryptField('12345678900');
    expect(enc).not.toBe('12345678900');
    expect(enc.split(':')).toHaveLength(3);
    expect(decryptField(enc)).toBe('12345678900');
  });

  it('cifra não é determinística (IV aleatório)', () => {
    expect(encryptField('12345678900')).not.toBe(encryptField('12345678900'));
  });

  it('FAIL-CLOSED: encrypt LANÇA sem chave (nunca retorna texto puro)', () => {
    delete process.env.CPF_ENCRYPTION_KEY;
    expect(() => encryptField('12345678900')).toThrow(FieldCipherError);
  });

  it('FAIL-CLOSED: encrypt LANÇA com chave de tamanho inválido', () => {
    process.env.CPF_ENCRYPTION_KEY = 'abcd';
    expect(() => encryptField('12345678900')).toThrow(FieldCipherError);
  });

  it('decrypt LANÇA quando a tag GCM não bate (chave errada) — nunca devolve cifra crua', () => {
    const enc = encryptField('12345678900');
    process.env.CPF_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(() => decryptField(enc)).toThrow(FieldCipherError);
  });

  it('passthrough de valor legado não-cifrado (sem separador)', () => {
    expect(decryptField('12345678900')).toBe('12345678900');
    expect(decryptField('')).toBe('');
  });
});
