import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../infrastructure/auth/jwt.service', () => ({
  generateTokenPair: vi.fn(),
  rotateTokens: vi.fn(),
  revokeAllTokens: vi.fn(),
}));

import { vi } from 'vitest';
import { authRoutes } from './auth.routes';

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

  it('retorna role e tenantId direto do JWT (sem tocar no Supabase)', async () => {
    const app = await buildApp({ userId: 'u1', tenantId: 'tenant-1', role: 'super_admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/auth/me' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ role: 'super_admin', tenantId: 'tenant-1' });
  });

  it('fallback tenant_id snake_case', async () => {
    const app = await buildApp({ userId: 'u1', tenant_id: 'tenant-2', role: 'admin' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/auth/me' });
    expect(res.json()).toEqual({ role: 'admin', tenantId: 'tenant-2' });
  });
});
