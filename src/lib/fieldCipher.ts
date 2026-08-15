/**
 * Cifra de campo (AES-256-GCM) — FAIL-CLOSED + KEYRING/ROTAÇÃO.
 * (SEC-R1 / APPSEC-01 — auditoria 2026-08-10; SEC-R7 — key-id/rotação 2026-08-11)
 *
 * Fonte ÚNICA da cifra usada para CPF, credenciais de ERP e payload da DLQ.
 *
 * Regras de segurança:
 *  - A chave PRIMÁRIA vem de `process.env.CPF_ENCRYPTION_KEY` (64 hex = 32 bytes).
 *    **SEM prefixo VITE_** de propósito: NUNCA pode ir para o bundle do frontend.
 *  - **Sem fallback de chave-zero.** Se a chave falta/é inválida, encrypt/decrypt LANÇAM.
 *  - **encrypt nunca retorna texto puro** (o bug antigo era retornar o CPF em claro).
 *  - decrypt tolera dado legado NÃO cifrado (sem ':') por retrocompat de leitura,
 *    mas LANÇA se a tag GCM não bater / a chave certa não existir — nunca devolve cifra crua.
 *
 * SEC-R7 — Rotação de chave sem perda de dado:
 *  - Cada cifra carrega um KEY-ID curto (`kid`): `kid:iv:tag:ct`. O `kid` é derivado
 *    deterministicamente da chave (sha256(hex)[0..8]) — não revela a chave.
 *  - Um KEYRING mantém a chave primária (para cifrar) + chaves antigas para DECIFRAR
 *    durante a janela de rotação, via `CPF_ENCRYPTION_KEYS_PREVIOUS` (CSV de hex).
 *  - Rotação: (1) nova chave vira `CPF_ENCRYPTION_KEY`, a antiga entra em
 *    `CPF_ENCRYPTION_KEYS_PREVIOUS`; (2) dados novos usam o kid novo; (3) re-cifrar os
 *    antigos aos poucos (read→decrypt→encrypt); (4) remover a chave antiga do keyring.
 *  - Formato LEGADO (3 partes `iv:tag:ct`, sem kid) continua legível: decifra com a primária.
 *
 * Usa node-forge (mesma lib do código legado) para permanecer seguro no bundle do Vite
 * — ainda que estas funções nunca devam ser chamadas client-side.
 */
import forge from 'node-forge';

const KEY_ENV = 'CPF_ENCRYPTION_KEY';
const PREVIOUS_KEYS_ENV = 'CPF_ENCRYPTION_KEYS_PREVIOUS';

export class FieldCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldCipherError';
  }
}

interface KeyEntry {
  kid: string;
  bytes: string; // 32 bytes (binary string, formato do node-forge)
}

/** Deriva um key-id curto e estável a partir do hex da chave (não revela a chave). */
function keyIdFor(hexKey: string): string {
  return forge.md.sha256.create().update(hexKey).digest().toHex().slice(0, 8);
}

/** Valida o hex (32 bytes) e monta a entrada do keyring. Lança se inválido. */
function makeEntry(hex: string): KeyEntry {
  const bytes = forge.util.hexToBytes(hex);
  if (bytes.length !== 32) {
    throw new FieldCipherError(
      `${KEY_ENV} inválida: são necessários 32 bytes (64 caracteres hex).`,
    );
  }
  return { kid: keyIdFor(hex), bytes };
}

/** Carrega o keyring: primária (obrigatória) + antigas (opcionais, para rotação). */
function loadKeyring(): { primary: KeyEntry; byKid: Map<string, KeyEntry> } {
  const primaryHex =
    (typeof process !== 'undefined' && process.env && process.env[KEY_ENV]) || '';
  if (!primaryHex) {
    throw new FieldCipherError(
      `${KEY_ENV} não configurada — cifra de campo indisponível (fail-closed).`,
    );
  }
  const primary = makeEntry(primaryHex);
  const byKid = new Map<string, KeyEntry>();
  byKid.set(primary.kid, primary);

  const prevRaw =
    (typeof process !== 'undefined' && process.env && process.env[PREVIOUS_KEYS_ENV]) || '';
  for (const hex of prevRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const entry = makeEntry(hex);
    if (!byKid.has(entry.kid)) byKid.set(entry.kid, entry);
  }
  return { primary, byKid };
}

/** Cifra um valor. Lança se a chave faltar/for inválida — jamais retorna texto puro. */
export function encryptField(plain: string): string {
  if (!plain) return plain;
  const { primary } = loadKeyring();
  const iv = forge.random.getBytesSync(12);
  const cipher = forge.cipher.createCipher('AES-GCM', primary.bytes);
  cipher.start({ iv });
  cipher.update(forge.util.createBuffer(plain, 'utf8'));
  cipher.finish();
  const encrypted = cipher.output.getBytes();
  const tag = cipher.mode.tag.getBytes();
  return [
    primary.kid,
    forge.util.encode64(iv),
    forge.util.encode64(tag),
    forge.util.encode64(encrypted),
  ].join(':');
}

/** Decifra. Passthrough para valor legado sem ':' (não cifrado). Lança se a chave/ tag falhar. */
export function decryptField(value: string): string {
  if (!value || typeof value !== 'string' || !value.includes(':')) return value;

  const parts = value.split(':');
  let kid: string | null;
  let ivB64: string, tagB64: string, ctB64: string;
  if (parts.length === 4) {
    [kid, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  } else if (parts.length === 3) {
    // Formato LEGADO (pré-SEC-R7): sem kid → decifra com a chave primária.
    kid = null;
    [ivB64, tagB64, ctB64] = parts as [string, string, string];
  } else {
    return value; // formato desconhecido → passthrough (comportamento histórico)
  }

  const { primary, byKid } = loadKeyring();
  const entry = kid ? byKid.get(kid) : primary;
  if (!entry) {
    throw new FieldCipherError(
      `Nenhuma chave disponível para o key-id '${kid}' — rotação incompleta? ` +
        `Adicione a chave antiga em ${PREVIOUS_KEYS_ENV}.`,
    );
  }

  const iv = forge.util.decode64(ivB64);
  const tag = forge.util.decode64(tagB64);
  const encrypted = forge.util.decode64(ctB64);
  const decipher = forge.cipher.createDecipher('AES-GCM', entry.bytes);
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

/** Retorna o key-id da chave primária atual (para logs/ops de rotação). Lança sem chave. */
export function currentKeyId(): string {
  return loadKeyring().primary.kid;
}

// Aliases históricos — mantêm as assinaturas que db.ts/dbAdmin.ts expunham.
export const encryptCpf = encryptField;
export const decryptCpf = decryptField;
