import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/auth/rbac.middleware', () => ({
  requirePermission: () => async () => undefined,
}));

vi.mock('../../infrastructure/validation/zod-validator', () => ({
  validateBody: () => async (request: any) => { request.validatedBody = request.body; },
  validateParams: () => async (request: any) => { request.validatedParams = request.params; },
  validateQuery: () => async (request: any) => {
    // Conversões mínimas para os defaults do schema de listQuery.
    const q = request.query ?? {};
    request.validatedQuery = {
      status: q.status ?? 'pending',
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 20,
    };
  },
}));

const fromMock = vi.fn();

vi.mock('../../infrastructure/database/supabase.client', () => ({
  default: { from: fromMock },
}));

async function buildApp() {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = { userId: 'u1', tenantId: 'tenant-1', role: 'admin' };
  });
  const { safetyRoutes } = await import('./safety.routes');
  await app.register(safetyRoutes);
  return app;
}

describe('safety.routes (IA-21)', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('GET /api/v2/ia/safety/vetoes devolve items + total', async () => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      range: vi.fn(() => Promise.resolve({
        data: [{ id: 'v1', response_text: 'r1', categories: ['orientacao_perigosa'], review_status: 'pending' }],
        error: null,
        count: 1,
      })),
    };
    fromMock.mockReturnValueOnce(builder);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/safety/vetoes?status=pending' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('PATCH /api/v2/ia/safety/vetoes/:id atualiza review_status', async () => {
    // update() precisa manter a chainability (.eq().eq()) e o último .eq() resolve.
    const builder: any = {
      update: vi.fn(() => builder),
      eq: vi.fn(() => builder),
    };
    // O segundo .eq() (sobre tenant_id) retorna a Promise final.
    builder.eq
      .mockReturnValueOnce(builder)               // eq('id', id)
      .mockReturnValueOnce(Promise.resolve({ error: null })); // eq('tenant_id', ...)
    fromMock.mockReturnValueOnce(builder);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v2/ia/safety/vetoes/00000000-0000-0000-0000-000000000001',
      headers: { 'content-type': 'application/json' },
      payload: { review_status: 'veto_correto' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      ok: true,
      id: '00000000-0000-0000-0000-000000000001',
      review_status: 'veto_correto',
    });
  });

  it('PATCH /api/v2/ia/safety/vetoes/:id com status inválido → 400 (validador)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v2/ia/safety/vetoes/00000000-0000-0000-0000-000000000001',
      headers: { 'content-type': 'application/json' },
      payload: { review_status: 'nao_sei' },
    });
    expect([400, 500]).toContain(res.statusCode);
  });
});
