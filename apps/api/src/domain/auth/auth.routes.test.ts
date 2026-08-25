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

function mockAuthMe(opts: { isSandbox?: boolean | null; lastLoginAt?: string | null } = {}) {
  const { isSandbox = null, lastLoginAt = null } = opts;
  (supabaseAdmin.from as any).mockImplementation((table: string) => {
    const chain: any = {};
    for (const m of ['select', 'eq']) chain[m] = vi.fn().mockReturnValue(chain);
    if (table === 'tenants') {
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: isSandbox === null ? null : { is_sandbox: isSandbox }, error: null });
    } else if (table === 'users') {
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: lastLoginAt === null ? null : { last_login_at: lastLoginAt }, error: null });
    }
    return chain;
  });
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

  it('retorna role/tenantId do JWT + isSandbox do tenant + lastLoginAt do usuário', async () => {
    mockAuthMe({ isSandbox: true, lastLoginAt: '2026-08-25T12:00:00.000Z' });
    const app = await buildApp({ userId: 'u1', tenantId: 'tenant-1', role: 'super_admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/auth/me' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      role: 'super_admin',
      tenantId: 'tenant-1',
      isSandbox: true,
      lastLoginAt: '2026-08-25T12:00:00.000Z',
    });
    expect(supabaseAdmin.from).toHaveBeenCalledWith('tenants');
    expect(supabaseAdmin.from).toHaveBeenCalledWith('users');
  });

  it('is_sandbox=false/ausente -> isSandbox: false', async () => {
    mockAuthMe({ isSandbox: false });
    const app = await buildApp({ userId: 'u1', tenantId: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/auth/me' });
    expect(res.json()).toEqual({ role: 'admin', tenantId: 'tenant-1', isSandbox: false, lastLoginAt: null });
  });

  it('usuário sem last_login_at (nunca logou de novo após a coluna existir) -> lastLoginAt: null', async () => {
    mockAuthMe({ isSandbox: false, lastLoginAt: null });
    const app = await buildApp({ userId: 'u1', tenantId: 'tenant-1', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/auth/me' });
    expect(res.json()).toEqual({ role: 'admin', tenantId: 'tenant-1', isSandbox: false, lastLoginAt: null });
  });

  it('fallback tenant_id snake_case', async () => {
    mockAuthMe({ isSandbox: false });
    const app = await buildApp({ userId: 'u1', tenant_id: 'tenant-2', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/auth/me' });
    expect(res.json()).toEqual({ role: 'admin', tenantId: 'tenant-2', isSandbox: false, lastLoginAt: null });
  });
});
