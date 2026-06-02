import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, needsRehash } from './password.service';

describe('Argon2id Password Service', () => {
  it('gera hash diferente do texto puro', async () => {
    const hash = await hashPassword('minhasenha123');
    expect(hash).not.toBe('minhasenha123');
    expect(hash).toContain('argon2id');
  }, 10000);

  it('dois hashes da mesma senha são diferentes (salt único)', async () => {
    const hash1 = await hashPassword('mesmasenha');
    const hash2 = await hashPassword('mesmasenha');
    expect(hash1).not.toBe(hash2);
  }, 15000);

  it('verifica senha correta retorna true', async () => {
    const hash = await hashPassword('senhaCorreta123');
    const valid = await verifyPassword(hash, 'senhaCorreta123');
    expect(valid).toBe(true);
  }, 10000);

  it('verifica senha incorreta retorna false', async () => {
    const hash = await hashPassword('senhaCorreta123');
    const valid = await verifyPassword(hash, 'senhaErrada456');
    expect(valid).toBe(false);
  }, 10000);

  it('rejeita senha com menos de 8 caracteres', async () => {
    await expect(hashPassword('curta')).rejects.toThrow('8 caracteres');
  });

  it('hash com parâmetros atuais não precisa de rehash', async () => {
    const hash = await hashPassword('testeRehash123');
    const needs = await needsRehash(hash);
    expect(needs).toBe(false);
  }, 10000);
});
