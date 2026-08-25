import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { dashboardRoutes } from './dashboard.routes';

type AnyChain = { [k: string]: any };

/** Query builder mock: thenable (resolve direto no `await`) + encadeável. */
function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'not']) {
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
  app.decorate('authenticate', async (request: any) => {
    request.user = user;
  });
  await app.register(dashboardRoutes);
  await app.ready();
  return app;
}

describe('dashboard.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/dashboard/upsell-events', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/dashboard/upsell-events' });
      expect(res.statusCode).toBe(401);
    });

    it('retorna os eventos de upsell do tenant', async () => {
      const rows = [{ id: '1', outcome: 'converted', tenant_id: 'tenant-1' }];
      mockFrom({ data: rows, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/dashboard/upsell-events' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('upsell_events');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    });

    it('não vaza dado de outro tenant — filtro por tenant_id do JWT, não do request', async () => {
      mockFrom({ data: [], error: null });
      const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-2', role: 'operator' });

      await app.inject({ method: 'GET', url: '/api/v2/dashboard/upsell-events' });

      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-2');
    });
  });

  describe('GET /api/v2/dashboard/csat-ratings', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/dashboard/csat-ratings' });
      expect(res.statusCode).toBe(401);
    });

    it('retorna tickets com csat_score preenchido, filtrado por tenant', async () => {
      const rows = [{ id: 't1', csat_score: 5, created_at: '2026-08-01T00:00:00Z' }];
      mockFrom({ data: rows, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/dashboard/csat-ratings' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('tickets');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.not).toHaveBeenCalledWith('csat_score', 'is', null);
    });

    it('erro do Supabase -> 500', async () => {
      mockFrom({ data: null, error: { message: 'boom' } });
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/dashboard/csat-ratings' });

      expect(res.statusCode).toBe(500);
    });
  });
});
