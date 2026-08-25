import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { notificationsRoutes } from './notifications.routes';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'is', 'order', 'limit', 'update']) {
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
  await app.register(notificationsRoutes);
  await app.ready();
  return app;
}

describe('notifications.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('GET /api/v2/notifications', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/notifications' });
      expect(res.statusCode).toBe(401);
    });

    it('lista não lidas filtrando por tenant do JWT (read_at null)', async () => {
      const rows = [{ id: 'n1', tenant_id: 'tenant-1', read_at: null }];
      mockFrom({ data: rows, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/notifications' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('notifications');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.is).toHaveBeenCalledWith('read_at', null);
    });

    it('não vaza dado de outro tenant', async () => {
      mockFrom({ data: [], error: null });
      const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-2', role: 'operator' });
      await app.inject({ method: 'GET', url: '/api/v2/notifications' });
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-2');
    });
  });

  describe('PATCH /api/v2/notifications/:id/read', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'PATCH', url: '/api/v2/notifications/n1/read' });
      expect(res.statusCode).toBe(401);
    });

    it('marca read_at e filtra por tenant', async () => {
      mockFrom({ data: null, error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'PATCH', url: '/api/v2/notifications/n1/read' });
      expect(res.statusCode).toBe(200);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ read_at: expect.any(String) }));
      expect(chain.eq).toHaveBeenCalledWith('id', 'n1');
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });
  });

  describe('PATCH /api/v2/notifications/read-all', () => {
    it('marca todas as não lidas do tenant', async () => {
      mockFrom({ data: null, error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'PATCH', url: '/api/v2/notifications/read-all' });
      expect(res.statusCode).toBe(200);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.is).toHaveBeenCalledWith('read_at', null);
    });

    it('erro do Supabase -> 500', async () => {
      mockFrom({ data: null, error: { message: 'boom' } });
      const app = await buildApp();
      const res = await app.inject({ method: 'PATCH', url: '/api/v2/notifications/read-all' });
      expect(res.statusCode).toBe(500);
    });
  });
});
