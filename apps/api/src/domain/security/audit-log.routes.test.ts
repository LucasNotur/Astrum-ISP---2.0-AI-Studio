import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { auditLogRoutes } from './audit-log.routes';

function makeChain(terminal: { data: any; error: any }) {
  const chain: any = {};
  for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFrom(terminal: { data: any; error: any }) {
  (supabaseAdmin.from as any).mockReturnValue(makeChain(terminal));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = user;
  });
  await app.register(auditLogRoutes);
  await app.ready();
  return app;
}

describe('audit-log.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/security/audit-log', () => {
    it('sem tenant no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/security/audit-log' });
      expect(res.statusCode).toBe(401);
    });

    it('lista entradas do tenant, filtrado por tenant_id', async () => {
      const rows = [{ id: 'a1', action: 'login', created_at: '2026-08-25T00:00:00Z' }];
      mockFrom({ data: rows, error: null });
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/security/audit-log' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(rows);
      expect(supabaseAdmin.from).toHaveBeenCalledWith('audit_log');
      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
      expect(chain.limit).toHaveBeenCalledWith(500);
    });

    it('não vaza dado de outro tenant — filtro por tenant_id do JWT', async () => {
      mockFrom({ data: [], error: null });
      const app = await buildApp({ userId: 'op-2', tenantId: 'tenant-2', role: 'admin' });

      await app.inject({ method: 'GET', url: '/api/v2/security/audit-log' });

      const chain = (supabaseAdmin.from as any).mock.results[0].value;
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-2');
    });

    it('erro do Supabase -> 500', async () => {
      mockFrom({ data: null, error: { message: 'boom' } });
      const app = await buildApp();

      const res = await app.inject({ method: 'GET', url: '/api/v2/security/audit-log' });

      expect(res.statusCode).toBe(500);
    });
  });
});
