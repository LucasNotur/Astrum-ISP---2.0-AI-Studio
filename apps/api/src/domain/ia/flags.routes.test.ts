import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { flagsRoutes } from './flags.routes';

async function buildApp() {
  const app = Fastify();
  await app.register(flagsRoutes);
  return app;
}

describe('flags.routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('GET /api/v2/flags/public retorna flags como booleans', async () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'true';
    process.env.TOOL_REGISTRY_ENABLED = 'true';
    process.env.SAFETY_CLASSIFIER_ENABLED = 'true';
    process.env.GRAPHRAG_ENABLED = 'true';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/flags/public' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ flags: { hub: true, toolreg: true, safety: true, graphrag: true } });
  });

  it('flag off retorna false', async () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'false';
    delete process.env.TOOL_REGISTRY_ENABLED;
    delete process.env.SAFETY_CLASSIFIER_ENABLED;
    delete process.env.GRAPHRAG_ENABLED;
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/flags/public' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({ flags: { hub: false, toolreg: false, safety: false, graphrag: false } });
  });

  it('define Cache-Control publico de 60s', async () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'true';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/flags/public' });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });
});
