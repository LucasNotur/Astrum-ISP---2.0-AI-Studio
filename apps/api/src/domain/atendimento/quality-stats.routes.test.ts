import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { qualityStatsRoutes } from './quality-stats.routes';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'order', 'limit']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFrom(terminal: { data: any; error: any }) {
  (supabaseAdmin.from as any).mockReturnValue(makeChain(terminal));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'operator' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(qualityStatsRoutes);
  await app.ready();
  return app;
}

describe('GET /api/v2/quality/active-conversations', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sem tenant -> 401', async () => {
    const app = await buildApp({});
    const res = await app.inject({ method: 'GET', url: '/api/v2/quality/active-conversations' });
    expect(res.statusCode).toBe(401);
  });

  it('lista tickets abertos do tenant, ordenados por updated_at desc, limit 10', async () => {
    const rows = [{ id: 't1', status: 'open' }];
    mockFrom({ data: rows, error: null });
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/v2/quality/active-conversations' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(rows);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('tickets');
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    expect(chain.eq).toHaveBeenCalledWith('status', 'open');
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it('não vaza dado de outro tenant', async () => {
    mockFrom({ data: [], error: null });
    const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-2', role: 'operator' });
    await app.inject({ method: 'GET', url: '/api/v2/quality/active-conversations' });
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-2');
  });
});
