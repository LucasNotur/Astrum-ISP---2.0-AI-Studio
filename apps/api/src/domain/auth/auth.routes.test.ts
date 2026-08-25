import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/auth/jwt.service', () => ({
  generateTokenPair: vi.fn(),
  rotateTokens: vi.fn(),
  revokeAllTokens: vi.fn(),
}));

vi.mock('../../infrastructure/database/supabase.client', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { vi } from 'vitest';
import { authRoutes } from './auth.routes';
import { supabaseAdmin } from '../../infrastructure/database/supabase.client';

function mockTenantIsSandbox(isSandbox: boolean | null) {
  const chain: any = {};
  for (const m of ['select', 'eq']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: isSandbox === null ? null : { is_sandbox: isSandbox }, error: null });
  (supabaseAdmin.from as any).mockReturnValue(chain);
  return chain;
}

async function buildApp(user: any) {
  const app = Fastify();
  app.decorate('authenticate', async (request: any, reply: any) => {
    if (!user) return reply.code(401).send({ code: 'UNAUTHORIZED' });
    request.user = user;
  });
  await app.register(authRoutes);
  await app.ready();
  return app;
}

describe('GET /api/v2/auth/me', () => {
  it('sem autenticação -> 401', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/api/v2/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('retorna role e tenantId do JWT + isSandbox do tenant (is_sandbox=true)', async () => {
    mockTenantIsSandbox(true);
    const app = await buildApp({ userId: 'u1', tenantId: 'tenant-1', role: 'super_admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/auth/me' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ role: 'super_admin', tenantId: 'tenant-1', isSandbox: true });
    expect(supabaseAdmin.from).toHaveBeenCalledWith('tenants');
  });

  it('is_sandbox=false/ausente -> isSandbox: false', async () => {
    mockTenantIsSandbox(false);
    const app = await buildApp({ userId: 'u1', tenantId: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/auth/me' });
    expect(res.json()).toEqual({ role: 'admin', tenantId: 'tenant-1', isSandbox: false });
  });

  it('fallback tenant_id snake_case', async () => {
    mockTenantIsSandbox(false);
    const app = await buildApp({ userId: 'u1', tenant_id: 'tenant-2', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/auth/me' });
    expect(res.json()).toEqual({ role: 'admin', tenantId: 'tenant-2', isSandbox: false });
  });
});
