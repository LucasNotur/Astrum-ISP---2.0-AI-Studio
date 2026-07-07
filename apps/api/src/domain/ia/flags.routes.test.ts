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
    delete process.env.DRIFT_DETECTION_ENABLED;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('GET /api/v2/flags/public retorna flags como booleans', async () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'true';
    process.env.TOOL_REGISTRY_ENABLED = 'true';
<<<<<<< HEAD
    process.env.SAFETY_CLASSIFIER_ENABLED = 'true';
    process.env.GRAPHRAG_ENABLED = 'true';
    process.env.LIVE_TRANSLATION_ENABLED = 'true';
    process.env.PROMPT_COMPRESSION_ENABLED = 'true';
=======
    process.env.DRIFT_DETECTION_ENABLED = 'true';
>>>>>>> feat/ia33-drift-detection
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/flags/public' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
<<<<<<< HEAD
    expect(body).toEqual({ flags: { hub: true, toolreg: true, safety: true, graphrag: true, translate: true, compression: true } });
=======
    expect(body).toEqual({ flags: { hub: true, toolreg: true, drift: true } });
>>>>>>> feat/ia33-drift-detection
  });

  it('flag off retorna false', async () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'false';
    delete process.env.TOOL_REGISTRY_ENABLED;
<<<<<<< HEAD
    delete process.env.SAFETY_CLASSIFIER_ENABLED;
    delete process.env.GRAPHRAG_ENABLED;
    delete process.env.LIVE_TRANSLATION_ENABLED;
    delete process.env.PROMPT_COMPRESSION_ENABLED;
=======
    delete process.env.DRIFT_DETECTION_ENABLED;
>>>>>>> feat/ia33-drift-detection
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/flags/public' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
<<<<<<< HEAD
    expect(body).toEqual({ flags: { hub: false, toolreg: false, safety: false, graphrag: false, translate: false, compression: false } });
=======
    expect(body).toEqual({ flags: { hub: false, toolreg: false, drift: false } });
>>>>>>> feat/ia33-drift-detection
  });

  it('define Cache-Control publico de 60s', async () => {
    process.env.INTELLIGENCE_HUB_ENABLED = 'true';
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/flags/public' });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });
});
