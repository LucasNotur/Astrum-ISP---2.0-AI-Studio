import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Mocks antes de qualquer import de rotas
vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../adapters/webhooks/svix.service', () => {
  class SvixRetryError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
      this.name = 'SvixRetryError';
    }
  }
  return {
    SvixRetryError,
    svixService: {
      listEndpoints: vi.fn().mockResolvedValue([{ id: 'ep1', url: 'https://hook.example.com' }]),
      addEndpoint: vi.fn().mockResolvedValue('ep2'),
      removeEndpoint: vi.fn().mockResolvedValue(undefined),
      getDashboardUrl: vi.fn().mockResolvedValue('https://svix.example.com/dashboard'),
      resendDelivery: vi.fn().mockResolvedValue({ resent: 1 }),
    },
  };
});

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

  it('GET /api/v2/webhooks/deliveries lista entregas do tenant, filtrado por tenant_id', async () => {
    const { supabaseAdmin } = await import('../../infrastructure/database/supabase.client');
    const rows = [{ id: 'd1', event_type: 'ticket.created', status: 'sent' }];
    const chain: any = {};
    for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve);
    (supabaseAdmin.from as any).mockReturnValue(chain);

    const res = await app.inject({ method: 'GET', url: '/api/v2/webhooks/deliveries' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(rows);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('webhook_deliveries');
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-test');
  });

  it('GET /api/v2/webhooks/config retorna o svix_app_id do tenant', async () => {
    const { supabaseAdmin } = await import('../../infrastructure/database/supabase.client');
    const chain: any = {};
    for (const m of ['select', 'eq']) chain[m] = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: { svix_app_id: 'app_123' }, error: null });
    (supabaseAdmin.from as any).mockReturnValue(chain);

    const res = await app.inject({ method: 'GET', url: '/api/v2/webhooks/config' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ svixAppId: 'app_123' });
    expect(supabaseAdmin.from).toHaveBeenCalledWith('tenants');
    expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-test');
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

  it('POST rejeita URL apontando para host interno (SSRF) com 400 e NÃO registra', async () => {
    const { svixService } = await import('../../adapters/webhooks/svix.service');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/webhooks/endpoints',
      payload: { url: 'http://169.254.169.254/latest/meta-data/', eventTypes: ['invoice.paid'] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('INVALID_WEBHOOK_URL');
    expect(svixService.addEndpoint).not.toHaveBeenCalled();
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

  it('POST /deliveries/:id/retry reenvia entrega, deriva tenant do JWT e retorna 202', async () => {
    const { svixService } = await import('../../adapters/webhooks/svix.service');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/webhooks/deliveries/del-123/retry',
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body)).toEqual({ resent: 1 });
    // tenant vem do JWT (tenant-test), NÃO do body/params
    expect(svixService.resendDelivery).toHaveBeenCalledWith('tenant-test', 'del-123');
  });

  it('POST /deliveries/:id/retry retorna 404 quando a entrega não existe para o tenant', async () => {
    const { svixService, SvixRetryError } = await import('../../adapters/webhooks/svix.service');
    (svixService.resendDelivery as any).mockRejectedValueOnce(
      new SvixRetryError('DELIVERY_NOT_FOUND', 'Entrega não encontrada para este tenant.'),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/webhooks/deliveries/nope/retry',
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('DELIVERY_NOT_FOUND');
  });

  it('POST /deliveries/:id/retry retorna 409 quando a entrega não tem referência Svix', async () => {
    const { svixService, SvixRetryError } = await import('../../adapters/webhooks/svix.service');
    (svixService.resendDelivery as any).mockRejectedValueOnce(
      new SvixRetryError('DELIVERY_NOT_RESENDABLE', 'Entrega sem referência Svix.'),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/webhooks/deliveries/old-1/retry',
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('DELIVERY_NOT_RESENDABLE');
  });

  it('POST /deliveries/:id/retry mascara erro inesperado como 502 sem vazar detalhe', async () => {
    const { svixService } = await import('../../adapters/webhooks/svix.service');
    (svixService.resendDelivery as any).mockRejectedValueOnce(new Error('svix 500: raw internal detail'));
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/webhooks/deliveries/boom/retry',
    });
    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('WEBHOOK_RETRY_FAILED');
    expect(res.body).not.toContain('raw internal detail');
  });
});
