import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { legacyCompatRoutes } from './legacy-compat.routes';

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(legacyCompatRoutes);
  await app.ready();
  return app;
}

describe('legacy-compat.routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => app.close());

  it('GET /api/system/webhook-url devolve webhookUrl apontando para /api/webhook/evolution', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/system/webhook-url' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.webhookUrl).toMatch(/^https?:\/\/.+\/api\/webhook\/evolution$/);
  });

  it('GET /api/health devolve shape simplificado com fastify.booted', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok', fastify: { booted: true } });
  });

  it('GET /api/health/whatsapp devolve status open com checked_at ISO', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health/whatsapp' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('open');
    expect(new Date(body.checked_at).toISOString()).toBe(body.checked_at);
  });
});
