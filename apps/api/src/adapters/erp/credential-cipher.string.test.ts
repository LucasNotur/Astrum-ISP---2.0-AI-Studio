import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptString, decryptString, looksEncrypted } from './credential-cipher';

const KEY = 'a'.repeat(64); // 32 bytes hex

describe('credential-cipher string helpers (SEC-R5)', () => {
  const orig = process.env.ERP_CRED_KEY;
  beforeEach(() => { process.env.ERP_CRED_KEY = KEY; });
  afterEach(() => {
    if (orig === undefined) delete process.env.ERP_CRED_KEY;
    else process.env.ERP_CRED_KEY = orig;
  });

  it('round-trip', () => {
    const enc = encryptString('sk-openai-abc123');
    expect(enc).not.toBe('sk-openai-abc123');
    expect(decryptString(enc)).toBe('sk-openai-abc123');
  });

  it('não-determinístico (IV aleatório)', () => {
    expect(encryptString('x')).not.toBe(encryptString('x'));
  });

  it('looksEncrypted reconhece envelope e ignora texto puro', () => {
    expect(looksEncrypted(encryptString('sk-abc'))).toBe(true);
    expect(looksEncrypted('sk-openai-plaintext')).toBe(false);
    expect(looksEncrypted('')).toBe(false);
    expect(looksEncrypted(undefined)).toBe(false);
  });

  it('decrypt lança com chave errada (tag GCM) — não devolve cifra crua', () => {
    const enc = encryptString('segredo');
    process.env.ERP_CRED_KEY = 'b'.repeat(64);
    expect(() => decryptString(enc)).toThrow();
  });

  it('encrypt lança sem ERP_CRED_KEY (fail-closed)', () => {
    delete process.env.ERP_CRED_KEY;
    expect(() => encryptString('x')).toThrow();
  });
});
