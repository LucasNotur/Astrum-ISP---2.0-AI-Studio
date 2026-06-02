import { describe, it, expect, beforeEach } from 'vitest';
import { validateWebhookSignature, generateWebhookSignature } from './hmac.service';

beforeEach(() => {
  process.env.WEBHOOK_HMAC_SECRET = 'test-secret-for-hmac-validation';
});

describe('HMAC Webhook Validation', () => {
  it('valida assinatura correta', () => {
    const payload = JSON.stringify({ event: 'message', data: 'test' });
    const signature = generateWebhookSignature(payload, 'generic');
    expect(validateWebhookSignature(payload, signature, 'generic')).toBe(true);
  });

  it('rejeita assinatura incorreta', () => {
    const payload = JSON.stringify({ event: 'message' });
    expect(validateWebhookSignature(payload, 'sha256=invalido000000', 'generic')).toBe(false);
  });

  it('rejeita payload modificado com assinatura original', () => {
    const original = JSON.stringify({ amount: 100 });
    const signature = generateWebhookSignature(original, 'generic');
    const tampered = JSON.stringify({ amount: 999 });
    expect(validateWebhookSignature(tampered, signature, 'generic')).toBe(false);
  });

  it('aceita assinatura com ou sem prefixo sha256=', () => {
    const payload = 'test-payload';
    const withPrefix = generateWebhookSignature(payload, 'generic');
    const withoutPrefix = withPrefix.replace('sha256=', '');
    expect(validateWebhookSignature(payload, withPrefix, 'generic')).toBe(true);
    expect(validateWebhookSignature(payload, withoutPrefix, 'generic')).toBe(true);
  });

  it('rejeita quando secret não está configurado', () => {
    delete process.env.WEBHOOK_HMAC_SECRET;
    expect(validateWebhookSignature('payload', 'sha256=abc', 'generic')).toBe(false);
  });
});
