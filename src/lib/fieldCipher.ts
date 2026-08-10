/**
 * Cifra de campo (AES-256-GCM) — FAIL-CLOSED. (SEC-R1 / APPSEC-01 — auditoria 2026-08-10)
 *
 * Fonte ÚNICA da cifra usada para CPF e credenciais de ERP (substitui as cópias
 * duplicadas e fail-open de db.ts/dbAdmin.ts).
 *
 * Regras de segurança:
 *  - A chave vem de `process.env.CPF_ENCRYPTION_KEY` (64 hex chars = 32 bytes).
 *    **SEM prefixo VITE_** de propósito: NUNCA pode ir para o bundle do frontend.
 *  - **Sem fallback de chave-zero.** Se a chave falta/é inválida, encrypt/decrypt LANÇAM.
 *  - **encrypt nunca retorna texto puro** (o bug antigo era retornar o CPF em claro).
 *  - decrypt tolera dado legado NÃO cifrado (sem o separador ':') por retrocompat de leitura,
 *    mas LANÇA se a tag GCM não bater (chave errada/dado corrompido) — nunca devolve cifra crua.
 *
 * Usa node-forge (mesma lib do código legado) para permanecer seguro no bundle do Vite
 * — ainda que estas funções nunca devam ser chamadas client-side.
 */
import forge from 'node-forge';

const KEY_ENV = 'CPF_ENCRYPTION_KEY';

export class FieldCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldCipherError';
  }
}

function getKeyBytes(): string {
  const hex =
    (typeof process !== 'undefined' && process.env && process.env[KEY_ENV]) || '';
  if (!hex) {
    throw new FieldCipherError(
      `${KEY_ENV} não configurada — cifra de campo indisponível (fail-closed).`,
    );
  }
  const key = forge.util.hexToBytes(hex);
  if (key.length !== 32) {
    throw new FieldCipherError(
      `${KEY_ENV} inválida: são necessários 32 bytes (64 caracteres hex).`,
    );
  }
  return key;
}

/** Cifra um valor. Lança se a chave faltar/for inválida — jamais retorna texto puro. */
export function encryptField(plain: string): string {
  if (!plain) return plain;
  const key = getKeyBytes();
  const iv = forge.random.getBytesSync(12);
  const cipher = forge.cipher.createCipher('AES-GCM', key);
  cipher.start({ iv });
  cipher.update(forge.util.createBuffer(plain, 'utf8'));
  cipher.finish();
  const encrypted = cipher.output.getBytes();
  const tag = cipher.mode.tag.getBytes();
  return (
    forge.util.encode64(iv) + ':' + forge.util.encode64(tag) + ':' + forge.util.encode64(encrypted)
  );
}

/** Decifra. Passthrough para valor legado sem ':' (não cifrado). Lança se a tag GCM falhar. */
export function decryptField(value: string): string {
  if (!value || typeof value !== 'string' || !value.includes(':')) return value;
  const parts = value.split(':');
  if (parts.length !== 3) return value;
  const key = getKeyBytes();
  const iv = forge.util.decode64(parts[0]);
  const tag = forge.util.decode64(parts[1]);
  const encrypted = forge.util.decode64(parts[2]);
  const decipher = forge.cipher.createDecipher('AES-GCM', key);
  decipher.start({ iv, tag: forge.util.createBuffer(tag) });
  decipher.update(forge.util.createBuffer(encrypted));
  const pass = decipher.finish();
  if (!pass) {
    throw new FieldCipherError(
      'Falha ao decifrar campo (tag GCM inválida — chave incorreta ou dado corrompido).',
    );
  }
  return decipher.output.toString();
}

// Aliases históricos — mantêm as assinaturas que db.ts/dbAdmin.ts expunham.
export const encryptCpf = encryptField;
export const decryptCpf = decryptField;
