import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { latencyRoutes } from './latency.routes';

function mockNodeLatencyRows(data: any[]) {
  const chain: any = {};
  for (const m of ['select', 'gte', 'order']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any) => Promise.resolve({ data, error: null }).then(resolve);
  (supabaseAdmin.from as any).mockReturnValue(chain);
}

async function buildApp(user: any) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(latencyRoutes);
  await app.ready();
  return app;
}

describe('GET /api/v2/ia/latency/report', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('node_latency_daily não tem dimensão de tenant -> restrito a super_admin, outros papéis levam 403', async () => {
    const app = await buildApp({ userId: 'op-1', tenantId: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/latency/report' });
    expect(res.statusCode).toBe(403);
  });

  it('super_admin acessa e recebe o relatório agregado', async () => {
    mockNodeLatencyRows([{ node: 'rag_query', day: '2026-08-25', p50: 100, p95: 200, count: 10 }]);
    const app = await buildApp({ userId: 'sa-1', tenantId: 'tenant-1', role: 'super_admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/latency/report' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.report).toEqual(
      expect.arrayContaining([expect.objectContaining({ node: 'rag_query' })]),
    );
  });
});
