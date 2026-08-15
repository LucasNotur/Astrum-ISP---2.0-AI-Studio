import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptField, decryptField, FieldCipherError, currentKeyId } from './fieldCipher';

const KEY = 'a'.repeat(64); // 32 bytes em hex
const KEY_B = 'b'.repeat(64);

describe('fieldCipher (SEC-R1 fail-closed)', () => {
  const orig = process.env.CPF_ENCRYPTION_KEY;
  const origPrev = process.env.CPF_ENCRYPTION_KEYS_PREVIOUS;
  beforeEach(() => {
    process.env.CPF_ENCRYPTION_KEY = KEY;
    delete process.env.CPF_ENCRYPTION_KEYS_PREVIOUS;
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.CPF_ENCRYPTION_KEY;
    else process.env.CPF_ENCRYPTION_KEY = orig;
    if (origPrev === undefined) delete process.env.CPF_ENCRYPTION_KEYS_PREVIOUS;
    else process.env.CPF_ENCRYPTION_KEYS_PREVIOUS = origPrev;
  });

  it('round-trip cifra e decifra (formato kid:iv:tag:ct)', () => {
    const enc = encryptField('12345678900');
    expect(enc).not.toBe('12345678900');
    const parts = enc.split(':');
    expect(parts).toHaveLength(4);           // SEC-R7: agora carrega key-id
    expect(parts[0]).toBe(currentKeyId());   // 1º campo é o kid da chave primária
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

  // ── SEC-R7: rotação de chave ────────────────────────────────────────────────
  it('rotação: dado cifrado com a chave antiga ainda decifra se ela está em PREVIOUS', () => {
    const enc = encryptField('12345678900');                 // cifrado com KEY
    process.env.CPF_ENCRYPTION_KEY = KEY_B;                    // nova primária
    process.env.CPF_ENCRYPTION_KEYS_PREVIOUS = KEY;           // antiga no keyring
    expect(decryptField(enc)).toBe('12345678900');           // decifra pelo kid antigo
  });

  it('rotação: sem a chave antiga no keyring → LANÇA (não devolve cifra crua)', () => {
    const enc = encryptField('12345678900');                 // cifrado com KEY
    process.env.CPF_ENCRYPTION_KEY = KEY_B;                    // só a nova, sem PREVIOUS
    expect(() => decryptField(enc)).toThrow(FieldCipherError);
  });

  it('novas cifras usam o kid da chave primária nova após a rotação', () => {
    const kidA = currentKeyId();
    process.env.CPF_ENCRYPTION_KEY = KEY_B;
    const kidB = currentKeyId();
    expect(kidB).not.toBe(kidA);
    expect(encryptField('x').split(':')[0]).toBe(kidB);
  });

  it('retrocompat: decifra formato LEGADO de 3 partes (iv:tag:ct, sem kid) com a primária', () => {
    // Simula um valor antigo (pré-SEC-R7): pega a cifra nova e remove o kid.
    const enc = encryptField('12345678900');
    const legacy = enc.split(':').slice(1).join(':'); // iv:tag:ct
    expect(legacy.split(':')).toHaveLength(3);
    expect(decryptField(legacy)).toBe('12345678900');
  });
});
