import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../infrastructure/database/tenant-rls', () => ({
  readTenantScoped: (_tenantId: string, paths: any) => paths.fallback(),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { edgeRoutes } from './edge.routes';

function makeChain(result: any) {
  const chain: any = {};
  for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

async function buildApp(user: Record<string, any> = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(edgeRoutes);
  await app.ready();
  return app;
}

describe('edge.routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET agreement com tenantId -> agrega os resultados do tenant', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({
      data: [
        { agree: true, edge_ms: 100, central_intent: 'billing', edge_intent: 'billing' },
        { agree: false, edge_ms: 200, central_intent: 'billing', edge_intent: 'support' },
      ],
      error: null,
    }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/edge/agreement' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 2, agreementRate: 50, avgEdgeMs: 150 });
  });

  it('GET com JWT shape antigo (tenant_id) -> agreement null, não cai em outro tenant', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/edge/agreement' });
    expect(res.json()).toEqual({ agreement: null });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});
