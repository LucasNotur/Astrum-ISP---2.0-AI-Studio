import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { metaWebhookRoutes } from './meta-webhook.routes';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(metaWebhookRoutes);
  await app.ready();
  return app;
}

describe('meta webhook alias — /api/webhook/facebook', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => app.close());

  it('GET (verificação) responde com o mesmo status/shape do GET /api/v2/webhook/meta', async () => {
    const qs = '?hub.mode=subscribe&hub.verify_token=x&hub.challenge=challenge123';
    const v2 = await app.inject({ method: 'GET', url: '/api/v2/webhook/meta' + qs });
    const legacy = await app.inject({ method: 'GET', url: '/api/webhook/facebook' + qs });

    // Sem META_WEBHOOK_VERIFY_TOKEN o verify falha (403) — provar que o alias é o MESMO handler.
    expect(v2.statusCode).toBe(403);
    expect(legacy.statusCode).toBe(v2.statusCode);
    expect(legacy.body).toBe(v2.body);
  });

  it('POST responde com o mesmo status/shape do POST /api/v2/webhook/meta', async () => {
    const payload = { object: 'unknown' };
    const v2 = await app.inject({ method: 'POST', url: '/api/v2/webhook/meta', payload });
    const legacy = await app.inject({ method: 'POST', url: '/api/webhook/facebook', payload });

    // `object` desconhecido ignora antes de qualquer I/O (200 { status: 'ignored' }).
    expect(v2.statusCode).toBe(200);
    expect(legacy.statusCode).toBe(v2.statusCode);
    expect(legacy.body).toBe(v2.body);
  });
});
