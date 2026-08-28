import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const h = vi.hoisted(() => ({
  userRole: { data: null as any, error: null as any },
  probes: { data: [] as any[], error: null as any },
}));

vi.mock('../database/supabase.client', () => {
  const usersChain: any = {
    select: vi.fn(() => usersChain),
    eq: vi.fn(() => usersChain),
    maybeSingle: vi.fn(() => Promise.resolve(h.userRole)),
  };
  const probesChain: any = {
    select: vi.fn(() => probesChain),
    order: vi.fn(() => probesChain),
    limit: vi.fn(() => Promise.resolve(h.probes)),
  };
  const supabaseAdmin = {
    from: vi.fn((table: string) => (table === 'users' ? usersChain : probesChain)),
  };
  return { supabaseAdmin };
});

import { syntheticMonitorRoutes } from './synthetic-monitor.routes';
import { supabaseAdmin } from '../database/supabase.client';

async function buildApp(user: any = { userId: 'u-1' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => {
    request.user = user;
  });
  await app.register(syntheticMonitorRoutes);
  await app.ready();
  return app;
}

describe('syntheticMonitorRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.userRole = { data: null, error: null };
    h.probes = { data: [], error: null };
  });

  describe('GET /api/v2/observability/synthetic-probes', () => {
    it('sem userId no JWT -> 401', async () => {
      const app = await buildApp({});
      const res = await app.inject({ method: 'GET', url: '/api/v2/observability/synthetic-probes' });
      expect(res.statusCode).toBe(401);
    });

    it('não super_admin -> 403', async () => {
      h.userRole = { data: { role: 'admin' }, error: null };
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/observability/synthetic-probes' });
      expect(res.statusCode).toBe(403);
    });

    it('super_admin -> devolve as probes mapeadas', async () => {
      h.userRole = { data: { role: 'super_admin' }, error: null };
      h.probes = {
        data: [{ tenant_id: 't-1', success: true, latency_ms: 1200, probed_at: '2026-08-28T12:00:00.000Z' }],
        error: null,
      };
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/observability/synthetic-probes' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        probes: [{ tenantId: 't-1', timestamp: '2026-08-28T12:00:00.000Z', success: true, latencyMs: 1200 }],
      });
      expect(supabaseAdmin.from).toHaveBeenCalledWith('synthetic_probe_results');
    });

    it('erro do Supabase -> 500', async () => {
      h.userRole = { data: { role: 'super_admin' }, error: null };
      h.probes = { data: null, error: new Error('conexão falhou') };
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v2/observability/synthetic-probes' });
      expect(res.statusCode).toBe(500);
    });
  });
});
