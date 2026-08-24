import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../infrastructure/database/tenant-rls', () => ({
  readTenantScoped: (_tenantId: string, paths: any) => paths.fallback(),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { anomalyRoutes } from './anomaly.routes';

function makeChain(result: any) {
  const chain: any = {};
  for (const m of ['select', 'eq', 'gte', 'order', 'limit']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

async function buildApp(user: Record<string, any> = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(anomalyRoutes);
  await app.ready();
  return app;
}

describe('anomaly.routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET anomalies com tenantId -> devolve anomalias do tenant', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ data: [{ id: 'a1' }], error: null }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/network/anomalies' });
    expect(res.json()).toEqual({ anomalies: [{ id: 'a1' }] });
  });

  it('GET anomalies com JWT shape antigo (tenant_id) -> vazio', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/network/anomalies' });
    expect(res.json()).toEqual({ anomalies: [] });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('GET health com tenantId e anomalias recentes -> anomalies_detected', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ data: [{ id: 'a1' }], error: null }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/network/health' });
    expect(res.json()).toEqual({ status: 'anomalies_detected' });
  });

  it('GET health com JWT shape antigo (tenant_id) -> unknown', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/network/health' });
    expect(res.json()).toEqual({ status: 'unknown' });
  });
});
