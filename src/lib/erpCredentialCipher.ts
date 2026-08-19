import crypto from 'node:crypto';

/**
 * Porta READ-ONLY do algoritmo de apps/api/src/adapters/erp/credential-cipher.ts
 * (SEC-R5) para o backend legado. O legado só LÊ — nunca grava cifrado — por isso
 * não há encryptString aqui (a chave ERP_CRED_KEY nunca deve chegar num bundle Vite).
 *
 * Chave: ERP_CRED_KEY (32 bytes em hex ou base64). Envelope: iv:tag:cipher (base64).
 */

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.ERP_CRED_KEY;
  if (!raw) throw new Error('ERP_CRED_KEY não configurada');
  const key = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ERP_CRED_KEY deve ter 32 bytes (256 bits)');
  return key;
}

export function decryptString(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Payload de credencial malformado');
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return out.toString('utf8');
}

export function looksEncrypted(v: string | undefined | null): boolean {
  if (!v || typeof v !== 'string') return false;
  const parts = v.split(':');
  return parts.length === 3 && parts.every((p) => p.length > 0 && /^[A-Za-z0-9+/=]+$/.test(p));
}
