import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../infrastructure/database/tenant-rls', () => ({
  readTenantScoped: (_tenantId: string, paths: any) => paths.fallback(),
  writeTenantScoped: (_tenantId: string, paths: any) => paths.fallback(),
}));

vi.mock('../ml/active-learning.service', () => ({
  recordExample: vi.fn(),
  isActiveLearningEnabled: vi.fn().mockReturnValue(false),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { ocrReviewRoutes } from './ocr-review.routes';

function makeChain(result: any) {
  const chain: any = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'update']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

async function buildApp(user: Record<string, any> = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(ocrReviewRoutes);
  await app.ready();
  return app;
}

describe('ocr-review.routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET queue com tenantId -> devolve fila pendente do tenant', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ data: [{ id: 'd1' }], error: null }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/ocr/queue' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ queue: [{ id: 'd1' }] });
  });

  it('GET queue com JWT shape antigo (tenant_id) -> fila vazia', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/ocr/queue' });
    expect(res.json()).toEqual({ queue: [] });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('PATCH :id approve com tenantId -> ok, reviewed_by usa o userId real (não mais "unknown")', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ error: null }));
    const app = await buildApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/v2/ia/ocr/d1', payload: { action: 'approve' } });
    expect(res.statusCode).toBe(200);
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ reviewed_by: 'op-1', review_status: 'approved' }));
  });

  it('PATCH :id com JWT shape antigo (tenant_id) -> 401', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'PATCH', url: '/api/v2/ia/ocr/d1', payload: { action: 'approve' } });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH :id action inválida -> 400', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PATCH', url: '/api/v2/ia/ocr/d1', payload: { action: 'nope' } });
    expect(res.statusCode).toBe(400);
  });
});
