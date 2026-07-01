import crypto from 'node:crypto';

/**
 * Credential Cipher — cifra/decifra credenciais de ERP em repouso (AES-256-GCM).
 * Plano Mestre V2, S75. As credenciais NUNCA ficam em texto puro no banco.
 *
 * Chave: ERP_CRED_KEY (32 bytes em base64 ou hex). Formato do ciphertext:
 *   base64(iv) : base64(authTag) : base64(cipher)
 */

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.ERP_CRED_KEY;
  if (!raw) throw new Error('ERP_CRED_KEY não configurada');
  const key = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ERP_CRED_KEY deve ter 32 bytes (256 bits)');
  return key;
}

export function encryptCredentials(plain: Record<string, unknown>, keyOverride?: Buffer): string {
  const key = keyOverride ?? getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), data.toString('base64')].join(':');
}

export function decryptCredentials<T = Record<string, unknown>>(payload: string, keyOverride?: Buffer): T {
  const key = keyOverride ?? getKey();
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Payload de credencial malformado');
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return JSON.parse(out.toString('utf8')) as T;
}
