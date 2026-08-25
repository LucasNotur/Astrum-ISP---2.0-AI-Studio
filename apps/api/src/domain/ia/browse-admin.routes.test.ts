import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('../../infrastructure/database/tenant-rls', () => ({
  readTenantScoped: (_tenantId: string, paths: any) => paths.fallback(),
  writeTenantScoped: (_tenantId: string, paths: any) => paths.fallback(),
}));

import { supabaseAdmin } from '../../infrastructure/database/supabase.client';
import { browseAdminRoutes } from './browse-admin.routes';

function makeChain(result: any) {
  const chain: any = {};
  for (const m of ['select', 'eq', 'order', 'delete', 'upsert']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any) => resolve(result);
  return chain;
}

async function buildApp(user: Record<string, any> = { userId: 'op-1', tenantId: 'tenant-1', role: 'admin' }) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any) => { request.user = user; });
  await app.register(browseAdminRoutes);
  await app.ready();
  return app;
}

describe('browse-admin.routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET allowlist com tenantId -> 200 com domínios do tenant', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ data: [{ domain: 'a.com' }], error: null }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/browse/allowlist' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ domains: [{ domain: 'a.com' }] });
  });

  it('GET com JWT tenant_id (fallback snake_case do helper) -> 200 com domínios do tenant resolvido', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ data: [{ domain: 'a.com' }], error: null }));
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/ia/browse/allowlist' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ domains: [{ domain: 'a.com' }] });
    expect(supabaseAdmin.from).toHaveBeenCalled();
  });

  it('POST domínio válido com tenantId -> 201, added_by usa o userId real do JWT (não mais "unknown")', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ error: null }));
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/ia/browse/allowlist', payload: { domain: 'Exemplo.com' } });
    expect(res.statusCode).toBe(201);
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'tenant-1', domain: 'exemplo.com', added_by: 'op-1' }),
      { onConflict: 'tenant_id,domain' },
    );
  });

  it('POST com JWT tenant_id (fallback snake_case do helper) -> 201 com tenant resolvido', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ error: null }));
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'POST', url: '/api/v2/ia/browse/allowlist', payload: { domain: 'exemplo.com' } });
    expect(res.statusCode).toBe(201);
    const chain = (supabaseAdmin.from as any).mock.results[0].value;
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'tenant-1', domain: 'exemplo.com', added_by: 'op-1' }),
      { onConflict: 'tenant_id,domain' },
    );
  });

  it('POST domínio inválido -> 400', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v2/ia/browse/allowlist', payload: { domain: 'not a domain' } });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE com tenantId -> ok', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ error: null }));
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v2/ia/browse/allowlist/exemplo.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('DELETE com JWT tenant_id (fallback snake_case do helper) -> ok', async () => {
    (supabaseAdmin.from as any).mockReturnValue(makeChain({ error: null }));
    const app = await buildApp({ userId: 'op-1', tenant_id: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'DELETE', url: '/api/v2/ia/browse/allowlist/exemplo.com' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
