import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { asaasWebhookRoutes } from './asaas-webhook.routes';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(asaasWebhookRoutes);
  await app.ready();
  return app;
}

describe('asaas webhook alias — POST /api/webhook/asaas', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => app.close());

  it('responde com o mesmo status/shape do POST /api/v2/webhook/asaas', async () => {
    const v2 = await app.inject({ method: 'POST', url: '/api/v2/webhook/asaas', payload: {} });
    const legacy = await app.inject({ method: 'POST', url: '/api/webhook/asaas', payload: {} });

    // Sem asaas-access-token e sem ASAAS_WEBHOOK_SECRET o handler é fail-closed (401).
    expect(v2.statusCode).toBe(401);
    expect(legacy.statusCode).toBe(v2.statusCode);
    expect(legacy.body).toBe(v2.body);
  });
});
