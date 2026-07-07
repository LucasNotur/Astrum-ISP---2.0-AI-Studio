import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import crypto from 'crypto';
import {
  registerTwilioVoiceRoutes,
  validateTwilioSignature,
  isWithinBusinessHours,
  type TwilioWebhookDeps,
} from './twilio-webhook.routes';

function buildApp(deps: Partial<TwilioWebhookDeps> = {}) {
  const app = Fastify();
  app.register((fastify) => registerTwilioVoiceRoutes(fastify, {
    tenantResolver: async () => ({ tenantId: 't1' }),
    skipSignatureInDev: true,
    getNow: () => new Date('2026-07-06T10:00:00'),
    ...deps,
  }));
  return app;
}

function signTwilio(authToken: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.map(k => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha1', authToken).update(url + data).digest('base64');
}

describe('twilio-webhook.routes', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, VOICE_ENGINE: 'mvp' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
    vi.unstubAllGlobals();
  });

  it('engine desligado → 404', async () => {
    process.env.VOICE_ENGINE = 'off';
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/telephony/voice/incoming' });
    expect(res.statusCode).toBe(404);
  });

  it('assinatura inválida em produção → 403 com Reject', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    const app = buildApp({ skipSignatureInDev: true });
    const res = await app.inject({
      method: 'POST',
      url: '/telephony/voice/incoming',
      headers: { 'x-twilio-signature': 'bad' },
      payload: { Called: '+5511999999999' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain('<Reject');
  });

  it('assinatura válida em produção → retorna TwiML de saudação', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TWILIO_AUTH_TOKEN = 'token';
    const params = { Called: '+5511999999999' };
    const url = 'http://localhost/telephony/voice/incoming';
    const signature = signTwilio('token', url, params);

    const app = buildApp({ skipSignatureInDev: true });
    const res = await app.inject({
      method: 'POST',
      url: '/telephony/voice/incoming',
      headers: { 'x-twilio-signature': signature, host: 'localhost' },
      payload: params,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
    expect(res.body).toContain('<Stream');
    expect(res.body).toContain('value="t1"');
  });

  it('dev com skip de assinatura → retorna TwiML mesmo sem header', async () => {
    process.env.NODE_ENV = 'development';
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/telephony/voice/incoming',
      payload: { Called: '+5511999999999' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<Say');
  });

  it('fora do horário comercial → TwiML de indisponibilidade + Hangup', async () => {
    process.env.NODE_ENV = 'development';
    const app = buildApp({ getNow: () => new Date('2026-07-05T10:00:00') });
    const res = await app.inject({
      method: 'POST',
      url: '/telephony/voice/incoming',
      payload: { Called: '+5511999999999' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('horário de atendimento');
    expect(res.body).toContain('<Hangup');
    expect(res.body).not.toContain('<Stream');
  });

  it('tenant não resolvido → 403', async () => {
    process.env.NODE_ENV = 'development';
    const app = buildApp({ tenantResolver: async () => null });
    const res = await app.inject({
      method: 'POST',
      url: '/telephony/voice/incoming',
      payload: { Called: '+5511999999999' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('validateTwilioSignature', () => {
  it('rejeita strings de tamanho diferente', () => {
    const ok = validateTwilioSignature('token', 'a', 'url', {});
    expect(ok).toBe(false);
  });

  it('aceita assinatura correta', () => {
    const params = { Called: '+5511999999999' };
    const url = 'https://example.com/telephony/voice/incoming';
    const signature = signTwilio('token', url, params);
    expect(validateTwilioSignature('token', signature, url, params)).toBe(true);
  });
});

describe('isWithinBusinessHours', () => {
  it('segunda 09h é comercial', () => {
    expect(isWithinBusinessHours(new Date('2026-07-06T09:00:00'))).toBe(true);
  });
  it('segunda 20h não é comercial', () => {
    expect(isWithinBusinessHours(new Date('2026-07-06T20:00:00'))).toBe(false);
  });
});
