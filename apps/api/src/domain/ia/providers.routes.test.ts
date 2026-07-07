import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/auth/rbac.middleware', () => ({
  requirePermission: () => async () => undefined,
}));

vi.mock('../../infrastructure/ai/providers/model-router', () => ({
  getCircuitState: vi.fn(),
}));

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: 'u1', tenantId: 'tenant-1', role: 'admin' };
  });
  const { providersRoutes } = await import('./providers.routes');
  await app.register(providersRoutes);
  return app;
}

describe('providers.routes (IA-43)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PROVIDER_FAILOVER_ENABLED;
    delete process.env.PROVIDER_ORDER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('shape estável: 3 providers + failoverEnabled + providerOrder', async () => {
    const { getCircuitState } = await import('../../infrastructure/ai/providers/model-router');
    (getCircuitState as any).mockResolvedValue('closed');
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.ANTHROPIC_API_KEY = 'ant-1';
    process.env.PROVIDER_ORDER = 'openai,anthropic,google';

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/providers/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body).toMatchObject({
      failoverEnabled: false,
      providerOrder: ['openai', 'anthropic', 'google'],
      providers: expect.any(Array),
    });
    expect(body.providers).toHaveLength(3);
    expect(body.providers.map((p: any) => p.name)).toEqual(['openai', 'anthropic', 'google']);
  });

  it('keyPresent=true quando env correspondente está setada', async () => {
    const { getCircuitState } = await import('../../infrastructure/ai/providers/model-router');
    (getCircuitState as any).mockResolvedValue('closed');
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.GOOGLE_API_KEY = 'goog-1';
    // sem ANTHROPIC_API_KEY

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/providers/status' });
    const body = JSON.parse(res.body);
    const byName = Object.fromEntries(body.providers.map((p: any) => [p.name, p]));

    expect(byName.openai.keyPresent).toBe(true);
    expect(byName.anthropic.keyPresent).toBe(false);
    expect(byName.google.keyPresent).toBe(true);
  });

  it('keyPresent=true para google quando só GEMINI_API_KEY (legado) está setado', async () => {
    const { getCircuitState } = await import('../../infrastructure/ai/providers/model-router');
    (getCircuitState as any).mockResolvedValue('closed');
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.GEMINI_API_KEY = 'gem-1';

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/providers/status' });
    const body = JSON.parse(res.body);
    const google = body.providers.find((p: any) => p.name === 'google');
    expect(google.keyPresent).toBe(true);
  });

  it('circuit reflete getCircuitState por provider', async () => {
    const { getCircuitState } = await import('../../infrastructure/ai/providers/model-router');
    (getCircuitState as any).mockImplementation(async (p: string) => {
      if (p === 'openai') return 'open';
      if (p === 'anthropic') return 'half-open';
      return 'closed';
    });
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.ANTHROPIC_API_KEY = 'ant-1';
    process.env.GOOGLE_API_KEY = 'goog-1';

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/providers/status' });
    const body = JSON.parse(res.body);
    const byName = Object.fromEntries(body.providers.map((p: any) => [p.name, p]));

    expect(byName.openai.circuit).toBe('open');
    expect(byName.anthropic.circuit).toBe('half-open');
    expect(byName.google.circuit).toBe('closed');
  });

  it('avgLatency24h=null (sessão futura)', async () => {
    const { getCircuitState } = await import('../../infrastructure/ai/providers/model-router');
    (getCircuitState as any).mockResolvedValue('closed');
    process.env.OPENAI_API_KEY = 'sk-1';

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/providers/status' });
    const body = JSON.parse(res.body);
    for (const p of body.providers as any[]) {
      expect(p.avgLatency24h).toBeNull();
    }
  });

  it('failoverEnabled=true reflete env true', async () => {
    const { getCircuitState } = await import('../../infrastructure/ai/providers/model-router');
    (getCircuitState as any).mockResolvedValue('closed');
    process.env.OPENAI_API_KEY = 'sk-1';
    process.env.PROVIDER_FAILOVER_ENABLED = 'true';

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/providers/status' });
    const body = JSON.parse(res.body);
    expect(body.failoverEnabled).toBe(true);
  });

  it('providerOrder default = [openai]', async () => {
    const { getCircuitState } = await import('../../infrastructure/ai/providers/model-router');
    (getCircuitState as any).mockResolvedValue('closed');
    process.env.OPENAI_API_KEY = 'sk-1';

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/providers/status' });
    const body = JSON.parse(res.body);
    expect(body.providerOrder).toEqual(['openai']);
  });
});
