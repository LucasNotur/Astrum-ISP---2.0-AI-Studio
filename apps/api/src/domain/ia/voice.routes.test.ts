import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../infrastructure/database/tenant-rls', () => ({
  readTenantScoped: (_tenantId: string, paths: any) => paths.fallback(),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { voiceQaRoutes } from './voice.routes';

function makeChain(result: any) {
  const chain: any = {};
  for (const m of ['select', 'eq', 'order', 'limit', 'single']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

async function buildApp(user: Record<string, any> = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(voiceQaRoutes);
  await app.ready();
  return app;
}

describe('voice.routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET calls com tenantId -> devolve chamadas do tenant', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({
      data: [{ id: 'call-1', phone_last4: '1234', status: 'done', voice_scorecards: [{ total: 8 }] }],
      error: null,
    }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/voice/calls' });
    expect(res.statusCode).toBe(200);
    expect(res.json().calls[0]).toMatchObject({ id: 'call-1', phoneLast4: '1234', scorecard: { total: 8 } });
  });

  it('GET calls com JWT shape antigo (tenant_id) -> lista vazia', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/voice/calls' });
    expect(res.json()).toEqual({ calls: [] });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it('GET calls/:id com JWT shape antigo (tenant_id) -> 401', async () => {
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/voice/calls/call-1' });
    expect(res.statusCode).toBe(401);
  });

  it('GET calls/:id não encontrada -> 404', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ data: null, error: null }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/voice/calls/call-x' });
    expect(res.statusCode).toBe(404);
  });
});
