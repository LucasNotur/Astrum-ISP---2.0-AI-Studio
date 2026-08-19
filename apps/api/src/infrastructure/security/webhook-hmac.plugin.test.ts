import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import webhookHmacPlugin from './webhook-hmac.plugin';
import { generateWebhookSignature } from './hmac.service';

/**
 * APPSEC-05 (regressão da FASE 4, 2026-08-18): o plugin validava HMAC contra
 * JSON.stringify(request.body) — bytes reserializados, diferentes do que o provider
 * assinou de fato — em vez dos bytes crus. Estes testes replicam o content-type parser
 * real de server.ts (a fonte de request.rawBody) para provar a validação byte-exata.
 */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();

  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    (request as any).rawBody = body;
    if (body.length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body.toString('utf8')));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(webhookHmacPlugin);
  app.post('/api/v2/webhook/evolution', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('webhookHmacPlugin — validação byte-exata (APPSEC-05)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.WEBHOOK_HMAC_SECRET = 'test-secret-rawbody';
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.WEBHOOK_HMAC_SECRET;
  });

  it('aceita assinatura calculada sobre os bytes crus, mesmo com formatação que mudaria ao reserializar', async () => {
    // Espaços extras e unicode que JSON.stringify(JSON.parse(raw)) NÃO reproduziria bit-a-bit.
    const rawFixed = '{ "event": "message",   "data": "olá 🚀" }';
    const signature = generateWebhookSignature(rawFixed, 'evolution');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/webhook/evolution',
      headers: { 'content-type': 'application/json', 'x-evolution-signature': signature },
      payload: rawFixed,
    });

    expect(res.statusCode).toBe(200);
  });

  it('rejeita assinatura calculada sobre o corpo RESERIALIZADO (a regressão) — prova que não há fallback pra JSON.stringify', async () => {
    const rawFixed = '{ "event": "message",   "data": "x" }';
    const reserialized = JSON.stringify(JSON.parse(rawFixed)); // bytes diferentes do raw
    const signatureOverReserialized = generateWebhookSignature(reserialized, 'evolution');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/webhook/evolution',
      headers: { 'content-type': 'application/json', 'x-evolution-signature': signatureOverReserialized },
      payload: rawFixed, // provider manda o raw; nossa assinatura de teste foi calculada sobre o reserializado
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejeita sem header de assinatura', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/webhook/evolution',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('MISSING_SIGNATURE');
  });

  it('falha fechado (401) se request.rawBody não foi capturado', async () => {
    const bare = Fastify();
    await bare.register(webhookHmacPlugin); // sem o content-type parser custom
    bare.post('/api/v2/webhook/evolution', async () => ({ ok: true }));
    await bare.ready();

    const signature = generateWebhookSignature('{}', 'evolution');
    const res = await bare.inject({
      method: 'POST',
      url: '/api/v2/webhook/evolution',
      headers: { 'content-type': 'application/json', 'x-evolution-signature': signature },
      payload: '{}',
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('MISSING_RAW_BODY');
    await bare.close();
  });
});
