import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Mocks antes de qualquer import de rotas
vi.mock('../../adapters/webhooks/svix.service', () => ({
  svixService: {
    listEndpoints: vi.fn().mockResolvedValue([{ id: 'ep1', url: 'https://hook.example.com' }]),
    addEndpoint: vi.fn().mockResolvedValue('ep2'),
    removeEndpoint: vi.fn().mockResolvedValue(undefined),
    getDashboardUrl: vi.fn().mockResolvedValue('https://svix.example.com/dashboard'),
  },
}));

async function buildApp() {
  const app = Fastify();

  // Decorator authenticate usado pelas rotas
  app.decorate('authenticate', async (request: any, _reply: any) => {
    (request as any).user = { tenantId: 'tenant-test', userId: 'user-test' };
  });

  const routes = await import('./webhook-config.routes');
  await app.register(routes.default, { prefix: '' });
  await app.ready();
  return app;
}

describe('webhook-config.routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('GET /api/v2/webhooks/endpoints retorna lista de endpoints', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v2/webhooks/endpoints' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty('id', 'ep1');
  });

  it('POST /api/v2/webhooks/endpoints cadastra endpoint e retorna 201 com endpointId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/webhooks/endpoints',
      payload: { url: 'https://new-hook.example.com', eventTypes: ['invoice.paid'] },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ endpointId: 'ep2' });
  });

  it('DELETE /api/v2/webhooks/endpoints/:id remove endpoint e retorna 204', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v2/webhooks/endpoints/ep1' });
    expect(res.statusCode).toBe(204);
  });

  it('GET /api/v2/webhooks/portal retorna URL do portal Svix', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v2/webhooks/portal' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ url: 'https://svix.example.com/dashboard' });
  });
});
