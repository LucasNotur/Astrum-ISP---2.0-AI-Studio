import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { evolutionWebhookRoutes } from './evolution-webhook.routes';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(evolutionWebhookRoutes);
  await app.ready();
  return app;
}

describe('evolution webhook alias — POST /api/webhook/evolution', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => app.close());

  it('responde com o mesmo status/shape do POST /api/v2/webhook/evolution', async () => {
    const v2 = await app.inject({ method: 'POST', url: '/api/v2/webhook/evolution', payload: {} });
    const legacy = await app.inject({ method: 'POST', url: '/api/webhook/evolution', payload: {} });

    // Sem assinatura/secret o handler é fail-closed (401) — o que importa aqui é
    // provar que o alias aponta para o MESMO handler (mesmo status e mesmo body).
    expect(v2.statusCode).toBe(401);
    expect(legacy.statusCode).toBe(v2.statusCode);
    expect(legacy.body).toBe(v2.body);
  });
});
