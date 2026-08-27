import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { holidaysRoutes } from './holidays.routes';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'update', 'maybeSingle']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFrom(terminal: { data: any; error: any }) {
  (supabaseAdmin.from as any).mockReturnValue(makeChain(terminal));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(holidaysRoutes);
  await app.ready();
  return app;
}

describe('GET /api/v2/settings/holidays', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sem tenant -> 401', async () => {
    const app = await buildApp({});
    const res = await app.inject({ method: 'GET', url: '/api/v2/settings/holidays' });
    expect(res.statusCode).toBe(401);
  });

  it('devolve a lista filtrada por tenant do JWT', async () => {
    mockFrom({ data: { holidays: [{ date: '2026-12-25', name: 'Natal', type: 'nacional' }] }, error: null });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/settings/holidays' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ holidays: [{ date: '2026-12-25', name: 'Natal', type: 'nacional' }] });
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
  });

  it('sem linha no banco -> lista vazia', async () => {
    mockFrom({ data: null, error: null });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/settings/holidays' });
    expect(res.json()).toEqual({ holidays: [] });
  });
});

describe('PUT /api/v2/settings/holidays', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sem array -> 400', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/holidays', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('substitui a lista inteira, filtrado por tenant do JWT', async () => {
    mockFrom({ data: null, error: null });
    const app = await buildApp();
    const list = [{ date: '2026-01-01', name: 'Confraternização', type: 'nacional' }];

    const res = await app.inject({ method: 'PUT', url: '/api/v2/settings/holidays', payload: { holidays: list } });

    expect(res.statusCode).toBe(200);
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.update).toHaveBeenCalledWith({ holidays: list });
    expect(chain.eq).toHaveBeenCalledWith('id', 'tenant-1');
  });
});
