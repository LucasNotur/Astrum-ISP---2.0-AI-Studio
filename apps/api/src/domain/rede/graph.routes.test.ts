import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/auth/rbac.middleware', () => ({
  requirePermission: () => async () => undefined,
}));

vi.mock('../../infrastructure/validation/zod-validator', () => ({
  validateParams: () => async (request: any) => { request.validatedParams = request.params; },
  validateQuery: () => async (request: any) => {
    const q = request.query ?? {};
    request.validatedQuery = { days: q.days ? Number(q.days) : 30 };
  },
}));

// Mocka o network-graph.service com funções controláveis
const impactoCtoMock = vi.fn();
const reincidenciaMock = vi.fn();
const capacidadeMock = vi.fn();

vi.mock('./network-graph.service', async () => {
  const actual = await vi.importActual<any>('./network-graph.service');
  return {
    ...actual,
    impactoCto: impactoCtoMock,
    reincidencia: reincidenciaMock,
    capacidade: capacidadeMock,
    defaultDb: { from: vi.fn() },
  };
});

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: 'u1', tenantId: 'tenant-1', role: 'admin' };
  });
  const { graphRoutes } = await import('./graph.routes');
  await app.register(graphRoutes);
  return app;
}

describe('graph.routes (IA-16)', () => {
  beforeEach(() => {
    impactoCtoMock.mockReset();
    reincidenciaMock.mockReset();
    capacidadeMock.mockReset();
  });

  it('GET /impacto/:ctoId devolve 200 com payload do service', async () => {
    impactoCtoMock.mockResolvedValueOnce({
      cto: { id: 'cto1', name: 'Centro' },
      customers_total: 10,
      customers_with_open_ticket: 2,
      mrr_at_risk_cents: 50000,
      customers: [],
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/rede/graph/impacto/00000000-0000-0000-0000-000000000001',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.cto.name).toBe('Centro');
    expect(body.mrr_at_risk_cents).toBe(50000);
    expect(impactoCtoMock).toHaveBeenCalledWith(
      expect.anything(), 'tenant-1', '00000000-0000-0000-0000-000000000001',
    );
  });

  it('GET /impacto/:ctoId com CTO inexistente → 404', async () => {
    impactoCtoMock.mockResolvedValueOnce({ error: 'CTO não encontrada' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/rede/graph/impacto/00000000-0000-0000-0000-000000000001',
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('NOT_FOUND');
  });

  it('GET /reincidencia?days=7 → repassa days', async () => {
    reincidenciaMock.mockResolvedValueOnce([
      { cto_id: 'a', cto_name: 'A', tickets: 5, risk: 'alto' },
    ]);
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v2/rede/graph/reincidencia?days=7',
    });
    expect(res.statusCode).toBe(200);
    expect(reincidenciaMock).toHaveBeenCalledWith(expect.anything(), 'tenant-1', 7);
  });

  it('GET /capacidade → repassa tenant', async () => {
    capacidadeMock.mockResolvedValueOnce([
      { cto_id: 'a', cto_name: 'A', used_ports: 16, total_ports: 16, occupancy: 1, risk: 'critico' },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/rede/graph/capacidade' });
    expect(res.statusCode).toBe(200);
    expect(capacidadeMock).toHaveBeenCalledWith(expect.anything(), 'tenant-1');
  });
});
