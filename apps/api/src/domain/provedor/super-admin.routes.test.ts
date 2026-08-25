import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { superAdminRoutes } from './super-admin.routes';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'update', 'upsert']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFrom(terminal: { data: any; error: any }) {
  (supabaseAdmin.from as any).mockReturnValue(makeChain(terminal));
}

async function buildApp(user: any = { userId: 'sa-1', tenantId: 'tenant-1', role: 'super_admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { if (user) request.user = user; });
  await app.register(superAdminRoutes);
  await app.ready();
  return app;
}

describe('super-admin.routes', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('GET /api/v2/super-admin/tenants', () => {
    it('sem token -> 401', async () => {
      const app = await buildApp(null);
      const res = await app.inject({ method: 'GET', url: '/api/v2/super-admin/tenants' });
      expect(res.statusCode).toBe(401);
    });

    it('role não super_admin -> 403', async () => {
      const app = await buildApp({ userId: 'u1', tenantId: 't1', role: 'admin' });
      const res = await app.inject({ method: 'GET', url: '/api/v2/super-admin/tenants' });
      expect(res.statusCode).toBe(403);
    });

    it('super_admin lista todos os tenants (sem filtro de tenant — é o painel cross-tenant)', async () => {
      const rows = [{ id: 't1', name: 'ISP A' }, { id: 't2', name: 'ISP B' }];
      mockFrom({ data: rows, error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/super-admin/tenants' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('tenants');
    });
  });

  describe('PUT /api/v2/super-admin/tenants/:id', () => {
    it('role não super_admin -> 403', async () => {
      const app = await buildApp({ userId: 'u1', tenantId: 't1', role: 'operator' });
      const res = await app.inject({ method: 'PUT', url: '/api/v2/super-admin/tenants/t1', payload: { active: false } });
      expect(res.statusCode).toBe(403);
    });

    it('atualiza active de um tenant', async () => {
      mockFrom({ data: null, error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'PUT', url: '/api/v2/super-admin/tenants/t1', payload: { active: false } });
      expect(res.statusCode).toBe(200);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.update).toHaveBeenCalledWith({ active: false });
      expect(chain.eq).toHaveBeenCalledWith('id', 't1');
    });

    it('body vazio -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'PUT', url: '/api/v2/super-admin/tenants/t1', payload: {} });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v2/super-admin/shadow-results', () => {
    it('role não super_admin -> 403', async () => {
      const app = await buildApp({ userId: 'u1', tenantId: 't1', role: 'viewer' });
      const res = await app.inject({ method: 'GET', url: '/api/v2/super-admin/shadow-results' });
      expect(res.statusCode).toBe(403);
    });

    it('lista shadow_results', async () => {
      mockFrom({ data: [{ id: 's1' }], error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/super-admin/shadow-results' });
      expect(res.statusCode).toBe(200);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('shadow_results');
    });
  });

  describe('feature-flags', () => {
    it('GET role não super_admin -> 403', async () => {
      const app = await buildApp({ userId: 'u1', tenantId: 't1', role: 'admin' });
      const res = await app.inject({ method: 'GET', url: '/api/v2/super-admin/feature-flags' });
      expect(res.statusCode).toBe(403);
    });

    it('GET lista flags', async () => {
      mockFrom({ data: [{ id: 'f1', flag: 'cobrai_v2', enabled: true }], error: null });
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/super-admin/feature-flags' });
      expect(res.statusCode).toBe(200);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('tenant_feature_flags');
    });

    it('PUT faz upsert com onConflict tenant_id,flag', async () => {
      mockFrom({ data: null, error: null });
      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v2/super-admin/feature-flags',
        payload: { tenantId: 't1', flag: 'cobrai_v2', enabled: true },
      });
      expect(res.statusCode).toBe(200);
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.upsert).toHaveBeenCalledWith(
        { tenant_id: 't1', flag: 'cobrai_v2', enabled: true },
        { onConflict: 'tenant_id,flag' },
      );
    });

    it('PUT campos faltando -> 400', async () => {
      const app = await buildApp();
      const res = await app.inject({ method: 'PUT', url: '/api/v2/super-admin/feature-flags', payload: { tenantId: 't1' } });
      expect(res.statusCode).toBe(400);
    });
  });
});
