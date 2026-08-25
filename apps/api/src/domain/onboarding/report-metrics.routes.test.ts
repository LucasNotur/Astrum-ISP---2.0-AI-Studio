import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { onboardingReportMetricsRoutes } from './report-metrics.routes';

type AnyChain = { [k: string]: any };

function makeChain(terminal: { data: any; error: any; count?: number }): AnyChain {
  const chain: AnyChain = {};
  for (const m of ['select', 'eq']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(terminal).then(resolve, reject);
  return chain;
}

function mockFromSequence(results: Array<{ data: any; error: any; count?: number }>) {
  let i = 0;
  (supabaseAdmin.from as any).mockImplementation(() => makeChain(results[i++]));
}

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'operator' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(onboardingReportMetricsRoutes);
  await app.ready();
  return app;
}

describe('GET /api/v2/onboarding/report-metrics', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sem tenant -> 401', async () => {
    const app = await buildApp({});
    const res = await app.inject({ method: 'GET', url: '/api/v2/onboarding/report-metrics' });
    expect(res.statusCode).toBe(401);
  });

  it('agrega totalCustomers, overdueCount e overdueAmountCents do tenant do JWT', async () => {
    mockFromSequence([
      { data: null, error: null, count: 42 },
      { data: null, error: null, count: 5 },
      { data: [{ amount_cents: 10000 }, { amount_cents: 5000 }], error: null },
    ]);
    const app = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/api/v2/onboarding/report-metrics' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ totalCustomers: 42, overdueCount: 5, overdueAmountCents: 15000 });
    expect((supabaseAdmin.from as any).mock.calls.map((c: any) => c[0])).toEqual(['customers', 'invoices', 'invoices']);
    for (const result of (supabaseAdmin.from as any).mock.results) {
      expect(result.value.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
    }
  });

  it('erro do Supabase -> 500', async () => {
    mockFromSequence([{ data: null, error: { message: 'boom' }, count: 0 }]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/onboarding/report-metrics' });
    expect(res.statusCode).toBe(500);
  });
});
