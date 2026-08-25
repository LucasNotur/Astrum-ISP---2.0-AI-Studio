import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../../infrastructure/database/tenant-rls', () => ({
  readTenantScoped: vi.fn(),
  writeTenantScoped: vi.fn(),
}));
vi.mock('../../infrastructure/queue/priority-queues', () => ({ queues: { cobrai: { add: vi.fn() } } }));
vi.mock('../../infrastructure/queue/bullmq.client', () => ({ enqueueMessage: vi.fn() }));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { dlqRoutes } from './dlq.routes';

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

async function buildApp(user: any = { userId: 'op-1', tenantId: 'tenant-1', role: 'super_admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(dlqRoutes);
  await app.ready();
  return app;
}

describe('POST /api/v2/dlq/:id/discard', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sem tenant no JWT -> 401', async () => {
    const app = await buildApp({ role: 'super_admin' });
    const res = await app.inject({ method: 'POST', url: '/api/v2/dlq/job-1/discard' });
    expect(res.statusCode).toBe(401);
  });

  it('role sem reports:admin -> 403', async () => {
    const app = await buildApp({ userId: 'op-1', tenantId: 'tenant-1', role: 'operator' });
    const res = await app.inject({ method: 'POST', url: '/api/v2/dlq/job-1/discard' });
    expect(res.statusCode).toBe(403);
  });

  it('marca resolved=true sem reenfileirar, filtrando por tenant do JWT', async () => {
    mockFrom({ data: { id: 'job-1' }, error: null });
    const app = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/api/v2/dlq/job-1/discard', payload: { reason: 'duplicado' } });

    expect(res.statusCode).toBe(200);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('dead_letter_queue');
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ resolved: true, notes: 'duplicado' }));
    expect(chain.eq).toHaveBeenCalledWith('id', 'job-1');
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-1');
  });

  it('job de outro tenant -> 404', async () => {
    mockFrom({ data: null, error: null });
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/dlq/job-1/discard' });
    expect(res.statusCode).toBe(404);
  });
});
