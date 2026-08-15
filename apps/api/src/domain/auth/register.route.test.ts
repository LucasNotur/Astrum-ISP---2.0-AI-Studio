import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

// Captura o payload inserido em `users` para assertar o tenant_id efetivo.
const h = vi.hoisted(() => ({ captured: null as any }));

vi.mock('../../infrastructure/database/supabase.client', () => {
  const single = vi.fn().mockResolvedValue({
    data: { id: 'new-user-id', email: 'novo@isp.com', role: 'operator' },
    error: null,
  });
  const insert = vi.fn((payload: any) => {
    h.captured = payload;
    return { select: () => ({ single }) };
  });
  return {
    supabaseAdmin: { from: () => ({ insert }) },
    default: { from: () => ({ insert }) },
  };
});

vi.mock('../../infrastructure/auth/password.service', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-pw'),
}));

import { registerRoute } from './register.route';

const TENANT_A = '550e8400-e29b-41d4-a716-446655440000';
const TENANT_B = '550e8400-e29b-41d4-a716-446655440001';

async function buildApp() {
  const app = Fastify();
  await app.register(jwt, { secret: 'test-secret-32-chars-minimum-xxxx' });
  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ code: 'UNAUTHORIZED' });
    }
  });
  await app.register(registerRoute);
  await app.ready();
  return app;
}

function token(app: any, claims: Record<string, unknown>) {
  return (app as any).jwt.sign(claims);
}

const validBody = (tenantId: string) => ({
  name: 'Novo Operador',
  email: 'novo@isp.com',
  password: 'senhaSegura123',
  tenantId,
  role: 'operator' as const,
});

describe('POST /api/v2/auth/register (AUTH-09)', () => {
  beforeEach(() => {
    h.captured = null;
    vi.clearAllMocks();
  });

  it('admin cria usuário no PRÓPRIO tenant → 201 e usa o tenant do solicitante', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/register',
      headers: { authorization: `Bearer ${token(app, { userId: 'admin-a', tenantId: TENANT_A, role: 'admin' })}` },
      payload: validBody(TENANT_A),
    });
    expect(res.statusCode).toBe(201);
    expect(h.captured?.tenant_id).toBe(TENANT_A);
    await app.close();
  });

  it('admin tenta criar em OUTRO tenant → 403 e NÃO insere', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/register',
      headers: { authorization: `Bearer ${token(app, { userId: 'admin-a', tenantId: TENANT_A, role: 'admin' })}` },
      payload: validBody(TENANT_B),
    });
    expect(res.statusCode).toBe(403);
    expect(h.captured).toBeNull();
    await app.close();
  });

  it('super_admin pode criar em qualquer tenant → 201 com o tenant do body', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/register',
      headers: { authorization: `Bearer ${token(app, { userId: 'super-1', tenantId: TENANT_A, role: 'super_admin' })}` },
      payload: validBody(TENANT_B),
    });
    expect(res.statusCode).toBe(201);
    expect(h.captured?.tenant_id).toBe(TENANT_B);
    await app.close();
  });

  it('operador (não-admin) → 403 pelo gate de papel', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/register',
      headers: { authorization: `Bearer ${token(app, { userId: 'op-1', tenantId: TENANT_A, role: 'operator' })}` },
      payload: validBody(TENANT_A),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
