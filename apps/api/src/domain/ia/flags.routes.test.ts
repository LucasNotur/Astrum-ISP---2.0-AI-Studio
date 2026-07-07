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
    delete process.env.INTELLIGENCE_HUB_ENABLED;
    delete process.env.TOOL_REGISTRY_ENABLED;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('GET /api/v2/flags/public retorna flags como booleans', async () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'true';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/flags/public' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Asserção resiliente: valida shape e as chaves relevantes, não o mapa inteiro
    // (o whitelist cresce a cada sessão IA-XX; o mapa completo é testado em public-flags.test.ts).
    expect(body.flags.hub).toBe(true);
    expect(body.flags.toolreg).toBe(false);
    for (const v of Object.values(body.flags)) expect(typeof v).toBe('boolean');
  });

  it('flag off retorna false', async () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'false';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/flags/public' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.flags.hub).toBe(false);
  });

  it('define Cache-Control publico de 60s', async () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'true';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/flags/public' });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });
});
