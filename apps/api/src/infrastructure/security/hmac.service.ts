import crypto from 'node:crypto';
import { securityLogger } from '../logging/logger';

/**
 * Validação de HMAC-SHA256 para webhooks.
 *
 * Como funciona:
 * 1. O sistema externo (WhatsApp, pagamentos) assina o payload com um secret compartilhado
 * 2. Nós recalculamos o HMAC e comparamos com o recebido
 * 3. Se não bater → request rejeitada (possível ataque ou misconfiguration)
 *
 * Comparação em tempo constante (timingSafeEqual) evita timing attacks.
 */

export type WebhookProvider = 'evolution' | 'facebook' | 'payment' | 'generic';

const getSecrets = (): Record<WebhookProvider, string | undefined> => ({
  evolution: process.env.EVOLUTION_WEBHOOK_SECRET ?? process.env.WEBHOOK_HMAC_SECRET,
  facebook: process.env.FACEBOOK_APP_SECRET,
  payment: process.env.PAYMENT_WEBHOOK_SECRET ?? process.env.WEBHOOK_HMAC_SECRET,
  generic: process.env.WEBHOOK_HMAC_SECRET,
});

/**
 * Valida a assinatura HMAC de um webhook recebido.
 */
export function validateWebhookSignature(
  payload: string | Buffer,
  receivedSignature: string,
  provider: WebhookProvider = 'generic'
): boolean {
  const secret = getSecrets()[provider];

  if (!secret) {
    securityLogger.error({ provider }, 'HMAC secret não configurado para provider');
    return false;
  }

  // Remover prefixo se existir (ex: "sha256=abc123" → "abc123")
  const cleanSignature = receivedSignature.replace(/^sha256=/, '');

  const expectedHmac = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Comparação em tempo constante — evita timing attacks
  try {
    const receivedBuffer = Buffer.from(cleanSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedHmac, 'hex');

    if (receivedBuffer.length !== expectedBuffer.length) {
      securityLogger.warn({ provider }, 'HMAC com tamanho inválido rejeitado');
      return false;
    }

    const isValid = crypto.timingSafeEqual(receivedBuffer, expectedBuffer);

    if (!isValid) {
      securityLogger.warn({ provider }, '⚠️ Assinatura HMAC inválida — possível ataque');
    }

    return isValid;
  } catch {
    return false;
  }
}

/**
 * Gera a assinatura HMAC para um payload (uso em testes ou envio de webhooks).
 */
export function generateWebhookSignature(
  payload: string | Buffer,
  provider: WebhookProvider = 'generic'
): string {
  const secret = getSecrets()[provider];
  if (!secret) throw new Error(`Secret não configurado para provider: ${provider}`);

  return 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}
