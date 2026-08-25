import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { inventoryImportRoutes } from './inventory-import.routes';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['insert', 'select']) {
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
  await app.register(inventoryImportRoutes);
  await app.ready();
  return app;
}

describe('POST /api/v2/inventory/import', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sem tenant -> 401', async () => {
    const app = await buildApp({});
    const res = await app.inject({ method: 'POST', url: '/api/v2/inventory/import', payload: { items: [] } });
    expect(res.statusCode).toBe(401);
  });

  it('items vazio -> 400', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/inventory/import', payload: { items: [] } });
    expect(res.statusCode).toBe(400);
  });

  it('grava price_cents (não price) e tenant_id do JWT', async () => {
    mockFrom({ data: [{ id: 'i1' }], error: null });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/inventory/import',
      payload: { items: [{ name: 'Roteador', category: 'router', stock: 10, minStock: 2, priceCents: 12990 }], tenantId: 'attacker' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ imported: 1 });
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.insert).toHaveBeenCalledWith([
      expect.objectContaining({ tenant_id: 'tenant-1', name: 'Roteador', price_cents: 12990 }),
    ]);
  });
});
