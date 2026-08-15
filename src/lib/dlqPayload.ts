/**
 * Codec do payload da Dead Letter Queue (OBS-07 — auditoria 2026-08-10).
 *
 * A DLQ guardava `job.data` CRU (telefone, conteúdo de mensagem, base64 de mídia)
 * = PII em repouso no Postgres (risco LGPD). Este módulo é a FONTE ÚNICA que cifra
 * o payload na escrita (lib/queue.ts) e decifra no retry (routes/dlq.ts).
 *
 * - Cifra AES-256-GCM via `fieldCipher` (mesma infra do CPF/credenciais de ERP).
 * - Formato cifrado: `{ __enc: "iv:tag:ct", v: 1 }` — JSONB válido e auto-descritivo.
 * - Degradação graciosa: sem `CPF_ENCRYPTION_KEY` (dev/seed) o encrypt lança e
 *   caímos para texto puro — a DLQ é rede de segurança de diagnóstico; perder o
 *   registro seria pior que guardá-lo em claro num ambiente sem chave. Em produção
 *   (chave setada, gate de go-live) o payload fica cifrado.
 * - Backward-compat: linhas legadas em texto puro (sem `__enc`) são lidas direto.
 */
import { encryptField, decryptField } from './fieldCipher.ts';

export function encodeDlqPayload(data: any): any {
  try {
    return { __enc: encryptField(JSON.stringify(data ?? {})), v: 1 };
  } catch {
    return data ?? {};
  }
}

export function decodeDlqPayload(rawPayload: any): any {
  if (rawPayload && typeof rawPayload === 'object' && typeof rawPayload.__enc === 'string') {
    return JSON.parse(decryptField(rawPayload.__enc));
  }
  return rawPayload || {};
}
